"""Original synthetic metadata; never reads third-party content."""
import importlib.util
import json
import pathlib
import tempfile
import unittest
import zipfile

spec = importlib.util.spec_from_file_location('audit', 'scripts/imports/audit-math-corpus.py')
audit = importlib.util.module_from_spec(spec)
spec.loader.exec_module(audit)


class MathInventory(unittest.TestCase):
    def package(self, directory, questions, slug='original', total=None):
        path = pathlib.Path(directory) / f'{slug}-satchi-import.zip'
        book = dict(book=dict(slug=slug, title='Original', totalQuestions=len(questions) if total is None else total),
                    chapters=[dict(id='chapter', topics=[dict(id='topic', questions=questions)])])
        with zipfile.ZipFile(path, 'w') as z:
            z.writestr('book.json', json.dumps(book))
            # Deliberately invalid bytes: the auditor must inspect names only.
            z.writestr('assets/stem.png', b'not an image')
        return path

    def mcq(self, identity='original-1'):
        return dict(id=identity, type='mcq', options=[dict(label=k, text=str(i)) for i, k in enumerate('ABCD')])

    def test_rights_fail_closed_and_no_asset_reads(self):
        with tempfile.TemporaryDirectory() as d:
            q = self.mcq()
            q.update(questionImage='assets/stem.png', questionImageIncludesOptions=True)
            rows, summary = audit.audit([self.package(d, [q])], {'original': {'authorized': True}})
            self.assertEqual(rows[0]['status'], 'RIGHTS_NOT_VERIFIED')
            self.assertEqual(rows[0]['representation'], 'IMAGE_CONTAINS_OPTIONS')
            self.assertEqual(summary['assetsRead'], 0)
            self.assertEqual(summary['performedImageConversions'], 0)

    def test_all_records_retained_when_source_ids_collide(self):
        with tempfile.TemporaryDirectory() as d:
            q = self.mcq()
            rows, summary = audit.audit([self.package(d, [q, {**q, 'type': 'open', 'options': []}])], {})
            self.assertEqual(len(rows), 2)
            self.assertEqual(summary['uniqueCandidateIds'], 1)
            self.assertEqual(summary['identityCollisionOccurrences'], 2)
            self.assertTrue(all(r['identity_status'] == 'collision_requires_reconciliation' for r in rows))
            self.assertEqual(sum(summary['statuses'].values()), 2)

    def test_authorized_classification_and_missing_sources(self):
        with tempfile.TemporaryDirectory() as d:
            q = self.mcq()
            missing = {**self.mcq('original-2'), 'questionImage': 'assets/missing.png'}
            spr = dict(id='original-3', type='open', options=[])
            latex = self.mcq('original-4')
            latex['options'][0]['text'] = '$x^2$'
            rows, summary = audit.audit([self.package(d, [q, missing, spr, latex])],
                                        {'original': dict(authorized=True, evidence='Original synthetic test')})
            self.assertEqual([r['status'] for r in rows], ['ALREADY_STRUCTURED_TEXT', 'MISSING_SOURCE_ASSET', 'STUDENT_PRODUCED', 'ALREADY_STRUCTURED_LATEX'])
            self.assertEqual(summary['discoveredRecords'], 4)
            self.assertFalse(summary['databaseReconciled'])
            # Exactly matches the existing JS legacy UUID mapping.
            self.assertEqual(audit.stable_id('original-1'), 'cdf872b8-ea07-5f0d-a1e7-f378a3b84b93')

    def test_mismatched_declared_counts_are_rejected(self):
        with tempfile.TemporaryDirectory() as d:
            with self.assertRaisesRegex(ValueError, 'declared count'):
                audit.audit([self.package(d, [self.mcq()], total=2)], {})


if __name__ == '__main__':
    unittest.main()
