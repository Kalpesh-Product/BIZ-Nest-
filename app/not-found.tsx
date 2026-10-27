import Link from 'next/link';
export default function NotFound() {
  return <main className="tw:min-h-[80vh] tw:grid tw:place-content-center tw:text-center tw:p-[24px]"><h1 className="tw:mt-0 tw:mb-[.5rem] tw:[font-size:calc(1.375rem_+_1.5vw)] tw:min-[1200px]:[font-size:2.5rem] tw:font-medium tw:[line-height:1.2] tw:[font-family:logo-font]">Page not found</h1><p className="tw:mt-0 tw:mb-[1rem]">The page you are looking for is unavailable.</p><Link className="tw:text-[#3d3d3d] tw:no-underline tw:hover:text-[#ffc732]" href="/">Back to BIZ Nest</Link></main>;
}
