import { redirect } from 'next/navigation';

export const metadata = { title: 'บัญชีข้อมูลเกษตร' };

export default function DataPage() {
  redirect('/catalog');
}
