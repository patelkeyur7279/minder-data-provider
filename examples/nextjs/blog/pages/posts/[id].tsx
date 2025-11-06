import type { GetServerSideProps } from "next";
import Head from "next/head";
import Link from "next/link";
import { minder } from "minder-data-provider";
import { API_ENDPOINTS } from "../../lib/api";
import type { Post } from "../../lib/types";

/**
 * Post Detail Page - Using SSR (Server-Side Rendering)
 *
 * Why SSR?
 * - Need fresh data on every request
 * - User-specific content possible
 * - SEO-friendly (rendered HTML)
 * - Can access cookies/headers
 *
 * How it works:
 * - Runs on EVERY request
 * - Server renders HTML
 * - Sent to client
 */

interface PostPageProps {
  post: Post | null;
  error?: string;
}

export default function PostPage({ post, error }: PostPageProps) {
  if (error || !post) {
    return (
      <div className='container'>
        <div className='error'>
          <h1>❌ Error</h1>
          <p>{error || "Post not found"}</p>
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
          <span className='badge'>SSR</span>
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
              💡 This page uses <strong>SSR</strong> (Server-Side Rendering)
              <br />
              Data fetched on every request for fresh content
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
          background: #10b981;
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
 * getServerSideProps - SSR (Server-Side Rendering)
 *
 * When does this run?
 * - On EVERY request
 * - Server-side only
 * - Has access to request/response
 *
 * Why use minder() here?
 * - Access to cookies/headers via context
 * - Can forward auth tokens
 * - Consistent with client-side API
 */
export const getServerSideProps: GetServerSideProps<PostPageProps> = async (
  context
) => {
  const { id } = context.params!;

  /**
   * Fetch post on every request
   * Why? Always fresh data, can use auth from cookies
   */
  const { data, error, success } = await minder<Post>(
    API_ENDPOINTS.POST_BY_ID(id as string),
    {
      // Can pass cookies from context
      headers: {
        // Example: Cookie: context.req.headers.cookie
      },
    }
  );

  if (!success || error || !data) {
    return {
      props: {
        post: null,
        error: error?.message || "Post not found",
      },
    };
  }

  return {
    props: {
      post: data,
    },
  };
};
