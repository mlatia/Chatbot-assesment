import type {Metadata} from 'next';
import './globals.css';
export const metadata:Metadata={title:'PlacidWay Knowledge Assistant',description:'Explore ITC treatment packages with answers grounded in seven approved PlacidWay pages. Independent assessment demo.',icons:{icon:'/favicon.svg'}};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="en"><body>{children}</body></html>;}
