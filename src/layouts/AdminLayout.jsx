import AppShell from './AppShell.jsx';
import { adminNavigation } from '../lib/navigation.js';

export default function AdminLayout() {
  return <AppShell workspace="admin" navigation={adminNavigation} />;
}
