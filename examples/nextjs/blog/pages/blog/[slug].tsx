import type { GetStaticPaths, GetStaticProps } from "next";
import Head from "next/head";
import Link from "next/link";
import { minder } from "minder-data-provider";
import { API_ENDPOINTS } from "../../lib/api";
import type { Post } from "../../lib/types";

/**
 * Blog Post Page - Using ISR (Incremental Static Regeneration)
 *
 * Why ISR?
 * - Static speed + fresh data
 * - Best of SSG and SSR
 * - Pages regenerate in background
 * - No full rebuild needed
 *
 * How it works:
 * - Builds static HTML initially
 * - Revalidates after X seconds
 * - Updates in background
 * - Serves stale while revalidating
 */

interface BlogPostProps {
  post: Post | null;
}

export default function BlogPost({ post }: BlogPostProps) {
  if (!post) {
    return (
      <div className='container'>
        <div className='error'>
          <h1>❌ Post Not Found</h1>
          <Link href='/'>← Back to home</Link>
        </div>
      </div>
    );
  }

  return (
    <>
      <Head>
        <title>{post.title} - Minder Blog</title>
        <meta name='description' content={post.body.substring(0, 160)} />
      </Head>

      <div className='container'>
        <nav className='breadcrumb'>
          <Link href='/'>← Back to posts</Link>
          <span className='badge'>ISR</span>
        </nav>

        <article className='post'>
          <header>
            <h1>{post.title}</h1>
            <p className='meta'>
              Post ID: {post.id} • User ID: {post.userId}
            </p>
          </header>

          <div className='content'>
            <p>{post.body}</p>
          </div>

          <footer className='post-footer'>
            <p className='note'>
              ⚡ This page uses <strong>ISR</strong> (Incremental Static
              Regeneration)
              <br />
              Static page that regenerates every 60 seconds
              <br />
              Best of both worlds: Speed + Fresh data
            </p>
          </footer>
        </article>
      </div>

      <style jsx>{`
        .container {
          max-width: 800px;
          margin: 0 auto;
          padding: 2rem;
        }

        .breadcrumb {
          display: flex;
          align-items: center;
          gap: 1rem;
          margin-bottom: 2rem;
        }

        .breadcrumb a {
          color: #4f46e5;
          text-decoration: none;
        }

        .badge {
          background: #8b5cf6;
          color: white;
          padding: 0.25rem 0.75rem;
          border-radius: 1rem;
          font-size: 0.75rem;
          font-weight: 600;
        }

        .post {
          background: white;
          border: 1px solid #e5e7eb;
          border-radius: 0.5rem;
          padding: 2rem;
        }

        .post header h1 {
          font-size: 2rem;
          margin-bottom: 0.5rem;
        }

        .meta {
          color: #666;
          font-size: 0.875rem;
          margin-bottom: 1.5rem;
        }

        .content p {
          line-height: 1.8;
          color: #374151;
        }

        .post-footer {
          margin-top: 2rem;
          padding-top: 2rem;
          border-top: 1px solid #e5e7eb;
        }

        .note {
          background: #f3f4f6;
          padding: 1rem;
          border-radius: 0.375rem;
          font-size: 0.875rem;
          color: #666;
          line-height: 1.6;
        }

        .error {
          text-align: center;
          padding: 4rem 2rem;
        }

        .error h1 {
          font-size: 2rem;
          margin-bottom: 1rem;
        }

        .error a {
          color: #4f46e5;
          text-decoration: none;
        }
      `}</style>
    </>
  );
}

/**
 * getStaticPaths - Tell Next.js which pages to pre-render
 *
 * Why needed?
 * - Dynamic routes need to know which IDs to build
 * - Can build some/all pages at build time
 * - Fallback option for missing pages
 */
export const getStaticPaths: GetStaticPaths = async () => {
  /**
   * Fetch all posts to get IDs
   * Build pages for first 10 posts
   */
  const { data } = await minder<Post[]>(API_ENDPOINTS.POSTS);

  const paths = (data?.slice(0, 10) || []).map((post) => ({
    params: { slug: post.id.toString() },
  }));

  return {
    paths,
    /**
     * fallback: 'blocking'
     * - Missing pages generated on-demand
     * - User waits for generation
     * - Then cached for future requests
     */
    fallback: "blocking",
  };
};

/**
 * getStaticProps - ISR (Incremental Static Regeneration)
 *
 * The magic: revalidate
 * - Page rebuilds after 60 seconds
 * - Happens in background
 * - Users see old version while new one builds
 * - "Stale while revalidate" pattern
 */
export const getStaticProps: GetStaticProps<BlogPostProps> = async (
  context
) => {
  const { slug } = context.params!;

  const { data, error, success } = await minder<Post>(
    API_ENDPOINTS.POST_BY_ID(slug as string)
  );

  if (!success || error || !data) {
    return {
      props: {
        post: null,
      },
      // Still revalidate even on error
      revalidate: 60,
    };
  }

  return {
    props: {
      post: data,
    },
    /**
     * revalidate: 60
     *
     * This is what makes it ISR!
     * - Page static at build
     * - After 60s, next request triggers rebuild
     * - User sees old version immediately
     * - New version ready for next request
     */
    revalidate: 60, // Regenerate page every 60 seconds
  };
};
