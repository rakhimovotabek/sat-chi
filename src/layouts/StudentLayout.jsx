import AppShell from './AppShell.jsx';
import { studentNavigation } from '../lib/navigation.js';

export default function StudentLayout() {
  return <AppShell workspace="student" navigation={studentNavigation} />;
}
