import Link from "next/link";
import type { Post } from "../lib/types";

/**
 * PostCard Component - Reusable post preview card
 *
 * Why separate component?
 * - Used in multiple pages
 * - Easy to maintain styling
 * - Consistent UI across pages
 * - Single source of truth
 */

interface PostCardProps {
  post: Post;
  variant: "ssr" | "isr";
}

export default function PostCard({ post, variant }: PostCardProps) {
  /**
   * Different links for different rendering strategies
   * - SSR: /posts/[id] - Server-rendered on every request
   * - ISR: /blog/[slug] - Static with revalidation
   */
  const href = variant === "ssr" ? `/posts/${post.id}` : `/blog/${post.id}`;

  const badgeColor = variant === "ssr" ? "#10b981" : "#8b5cf6";
  const badgeLabel = variant === "ssr" ? "SSR" : "ISR";

  return (
    <Link href={href} className='card'>
      <div className='badge' style={{ background: badgeColor }}>
        {badgeLabel}
      </div>
      <h3 className='title'>{post.title}</h3>
      <p className='excerpt'>{post.body}</p>
      <div className='meta'>
        <span>Post #{post.id}</span>
        <span>User {post.userId}</span>
      </div>

      <style jsx>{`
        .card {
          display: block;
          background: white;
          border: 1px solid #e5e7eb;
          border-radius: 0.5rem;
          padding: 1.5rem;
          text-decoration: none;
          color: inherit;
          transition: all 0.2s;
          position: relative;
        }

        .card:hover {
          box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
          transform: translateY(-2px);
        }

        .badge {
          position: absolute;
          top: 1rem;
          right: 1rem;
          color: white;
          padding: 0.25rem 0.75rem;
          border-radius: 1rem;
          font-size: 0.75rem;
          font-weight: 600;
        }

        .title {
          font-size: 1.125rem;
          margin-bottom: 0.75rem;
          padding-right: 3rem;
          text-transform: capitalize;
        }

        .excerpt {
          color: #666;
          font-size: 0.875rem;
          line-height: 1.6;
          margin-bottom: 1rem;
          display: -webkit-box;
          -webkit-line-clamp: 3;
          line-clamp: 3;
          -webkit-box-orient: vertical;
          overflow: hidden;
        }

        .meta {
          display: flex;
          gap: 1rem;
          font-size: 0.75rem;
          color: #999;
        }
      `}</style>
    </Link>
  );
}
