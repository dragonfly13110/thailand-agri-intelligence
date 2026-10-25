import type { Metadata } from 'next';
import { Noto_Sans_Thai } from 'next/font/google';
import './globals.css';

const thai = Noto_Sans_Thai({subsets:['thai','latin'], display:'swap', variable:'--font-thai'});
export const metadata: Metadata = {
  title: {default:'ศูนย์ข้อมูลเกษตรไทย | TADIH', template:'%s | ศูนย์ข้อมูลเกษตรไทย'},
  description:'ค้นบัญชีข้อมูลเกษตร ตรวจที่มา ระดับพื้นที่ ช่วงเวลา และสิทธิ์การนำไปใช้ จากหลายหน่วยงานในที่เดียว',
};
export default function RootLayout({children}: {children: React.ReactNode}) {
  return <html lang="th"><body className={thai.variable}>{children}</body></html>;
}
