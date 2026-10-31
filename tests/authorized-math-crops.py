"""End-to-end deterministic crops of original synthetic questions only."""
import copy
import importlib.util
import pathlib
import subprocess
import tempfile
import unittest

spec = importlib.util.spec_from_file_location('crops', 'scripts/imports/crop-authorized-math.py')
crops = importlib.util.module_from_spec(spec)
spec.loader.exec_module(crops)


class AuthorizedCrops(unittest.TestCase):
    def make_source(self, root, columns):
        source = root / ('two-column.png' if columns else 'vertical.png')
        arguments = ['magick', '-size', '600x400', 'xc:white', '-font', 'DejaVu-Sans', '-pointsize', '24', '-fill', 'black', '-annotate', '+20+35', 'What is 2 + 2?']
        for label, value, x, y in [('A', '2', 20, 110), ('B', '4', 320 if columns else 20, 110 if columns else 180), ('C', '6', 20, 180 if columns else 250), ('D', '8', 320 if columns else 20, 180 if columns else 320)]:
            arguments += ['-annotate', f'+{x}+{y}', f'{label}) {value}']
        subprocess.run([*arguments, str(source)], check=True, capture_output=True)
        return source

    def plan(self, source, columns):
        return dict(question_id='original-two-column' if columns else 'original-vertical', book_id='original-authorized-math',
                    source_reference='Original synthetic 2+2 question, authored by SATchi',
                    rights=dict(authorized=True, evidence='Original synthetic test content'),
                    review=dict(status='approved', reviewer='Synthetic fixture author', mapping_verified=True, clean_stem_verified=True),
                    source=dict(path=source.name, sha256=crops.digest(source)), stem=[0, 0, 600, 70],
                    option_labels_in_images=True, options=dict(A=[0, 70, 300 if columns else 600, 70], B=[300, 70, 300, 70] if columns else [0, 140, 600, 70], C=[0, 140 if columns else 210, 300 if columns else 600, 70], D=[300, 140, 300, 70] if columns else [0, 280, 600, 70]), correct_choice='B')

    def test_vertical_and_two_column_sources_keep_keys_hashes_and_pixels(self):
        with tempfile.TemporaryDirectory() as directory:
            root = pathlib.Path(directory)
            for columns in [False, True]:
                source = self.make_source(root, columns)
                plan = self.plan(source, columns)
                before = crops.digest(source)
                result = crops.convert(plan, root, root/'derived', write=True)
                self.assertEqual(result['correct_choice'], 'B')
                self.assertFalse(result['applied_to_database'])
                self.assertEqual(set(result['new_mapping']), {'stem', 'A', 'B', 'C', 'D'})
                self.assertEqual(crops.digest(source), before)
                self.assertEqual(crops.convert(plan, root, root/'derived', write=True), result)
                for key, rectangle in result['regions'].items():
                    target = root/'derived'/plan['question_id']/result['new_mapping'][key]['path']
                    expected = root/'expected.png'
                    x, y, width, height = rectangle
                    subprocess.run(['magick', str(source), '-crop', f'{width}x{height}+{x}+{y}', '+repage', str(expected)], check=True, capture_output=True)
                    comparison = subprocess.run(['magick', 'compare', '-metric', 'AE', str(expected), str(target), 'null:'], capture_output=True, text=True)
                    self.assertEqual(comparison.returncode, 0, comparison.stderr)

    def test_unverified_rights_and_review_fail_before_missing_source_is_opened(self):
        with tempfile.TemporaryDirectory() as directory:
            root = pathlib.Path(directory)
            for plan in [{}, {'rights': {'authorized': True, 'evidence': 'Original'}}]:
                with self.assertRaisesRegex(ValueError, 'source not read'):
                    crops.convert(plan, root, root/'derived', write=True)
            self.assertFalse((root/'derived').exists())

    def test_overlap_wrong_hash_bounds_and_changed_derivatives_are_rejected(self):
        with tempfile.TemporaryDirectory() as directory:
            root = pathlib.Path(directory)
            source = self.make_source(root, True)
            original = self.plan(source, True)
            for mutation, message in [('overlap', 'Overlapping'), ('hash', 'SHA-256 changed'), ('bounds', 'exceeds source bounds')]:
                plan = copy.deepcopy(original)
                if mutation == 'overlap': plan['options']['A'] = plan['stem']
                elif mutation == 'hash': plan['source']['sha256'] = '0'*64
                else: plan['options']['D'] = [600, 140, 300, 70]
                with self.assertRaisesRegex(ValueError, message): crops.convert(plan, root, root/'derived', write=True)
            result = crops.convert(original, root, root/'derived', write=True)
            target = root/'derived'/original['question_id']/result['new_mapping']['A']['path']
            target.write_bytes(b'changed')
            with self.assertRaisesRegex(ValueError, 'derivative differs'): crops.convert(original, root, root/'derived', write=True)


if __name__ == '__main__':
    unittest.main()
