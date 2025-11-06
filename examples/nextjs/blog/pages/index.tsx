import type { GetStaticProps } from "next";
import Head from "next/head";
import Link from "next/link";
import { minder } from "minder-data-provider";
import { API_ENDPOINTS } from "../lib/api";
import type { Post } from "../lib/types";

/**
 * Home Page - Using SSG (Static Site Generation)
 *
 * Why SSG?
 * - Blog post list rarely changes
 * - Ultra-fast page loads (pre-rendered HTML)
 * - Perfect for public content
 * - SEO-friendly
 *
 * How it works:
 * - Runs at BUILD time
 * - Generates static HTML
 * - Served instantly to users
 */

interface HomeProps {
  posts: Post[];
}

export default function Home({ posts }: HomeProps) {
  return (
    <>
      <Head>
        <title>Blog - Minder Data Provider</title>
        <meta name='description' content='Blog built with Next.js and Minder' />
      </Head>

      <div className='container'>
        <header className='header'>
          <h1>📝 Minder Blog</h1>
          <p>Demonstrating SSG, SSR, and ISR with minder-data-provider</p>
        </header>

        <main>
          <div className='posts-grid'>
            {posts.map((post) => (
              <article key={post.id} className='post-card'>
                <h2>{post.title}</h2>
                <p>{post.body.substring(0, 100)}...</p>

                <div className='post-links'>
                  <Link href={`/posts/${post.id}`}>View (SSR) →</Link>
                  <Link href={`/blog/${post.id}`}>View (ISR) →</Link>
                </div>
              </article>
            ))}
          </div>
        </main>
      </div>

      <style jsx>{`
        .container {
          max-width: 1200px;
          margin: 0 auto;
          padding: 2rem;
        }

        .header {
          text-align: center;
          margin-bottom: 3rem;
        }

        .header h1 {
          font-size: 2.5rem;
          margin-bottom: 0.5rem;
        }

        .header p {
          color: #666;
        }

        .posts-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
          gap: 2rem;
        }

        .post-card {
          background: white;
          border: 1px solid #e5e7eb;
          border-radius: 0.5rem;
          padding: 1.5rem;
          transition: transform 0.2s, box-shadow 0.2s;
        }

        .post-card:hover {
          transform: translateY(-4px);
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
        }

        .post-card h2 {
          font-size: 1.25rem;
          margin-bottom: 0.75rem;
        }

        .post-card p {
          color: #666;
          line-height: 1.6;
          margin-bottom: 1rem;
        }

        .post-links {
          display: flex;
          gap: 1rem;
        }

        .post-links a {
          color: #4f46e5;
          text-decoration: none;
          font-weight: 500;
        }

        .post-links a:hover {
          text-decoration: underline;
        }
      `}</style>
    </>
  );
}

/**
 * getStaticProps - SSG (Static Site Generation)
 *
 * When does this run?
 * - At BUILD time only
 * - NOT on every request
 * - Generates static HTML
 *
 * Why use minder() here?
 * - Same API as client-side
 * - Consistent error handling
 * - Works in Node.js environment
 */
export const getStaticProps: GetStaticProps<HomeProps> = async () => {
  /**
   * Fetch posts at build time
   * This data becomes part of the static HTML
   */
  const { data, error, success } = await minder<Post[]>(API_ENDPOINTS.POSTS);

  if (!success || error) {
    console.error("Failed to fetch posts:", error);
    return {
      props: {
        posts: [],
      },
    };
  }

  /**
   * Return first 10 posts for home page
   * Why limit? Faster builds, better performance
   */
  return {
    props: {
      posts: data?.slice(0, 10) || [],
    },
    // Optional: Revalidate every 60 seconds (ISR)
    // Uncomment to enable ISR on home page
    // revalidate: 60,
  };
};
