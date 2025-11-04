/**
 * 🎯 COMPREHENSIVE DEMO PAGE
 */

import Head from 'next/head';
import ComprehensiveDemo from '../App.comprehensive';

export default function ComprehensiveDemoPage() {
  return (
    <>
      <Head>
        <title>Minder Data Provider - Comprehensive Demo</title>
        <meta name="description" content="Full-featured demo with all capabilities" />
        <link rel="icon" href="/favicon.ico" />
      </Head>
      <ComprehensiveDemo />
    </>
  );
}

// Disable static generation for this page (requires client-side rendering)
export async function getServerSideProps() {
  return {
    props: {},
  };
}
