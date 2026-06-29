'use client';

import { useState, useEffect, useCallback } from 'react';
import { supabase, Post, Comment } from '@/lib/supabase';
import Link from 'next/link';

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return '방금';
  if (m < 60) return `${m}분 전`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}시간 전`;
  return `${Math.floor(h / 24)}일 전`;
}

export default function FeedbackPage() {
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [showWrite, setShowWrite] = useState(false);
  const [nickname, setNickname] = useState('');
  const [content, setContent] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [expandedPost, setExpandedPost] = useState<number | null>(null);
  const [comments, setComments] = useState<Record<number, Comment[]>>({});
  const [commentNick, setCommentNick] = useState('');
  const [commentText, setCommentText] = useState('');

  const fetchPosts = useCallback(async () => {
    const { data } = await supabase
      .from('posts')
      .select('*')
      .order('created_at', { ascending: false });
    setPosts(data || []);
    setLoading(false);
  }, []);

  useEffect(() => { fetchPosts(); }, [fetchPosts]);

  const submitPost = async () => {
    if (!nickname.trim() || !content.trim()) return;
    setSubmitting(true);
    await supabase.from('posts').insert({ nickname: nickname.trim(), content: content.trim() });
    setNickname('');
    setContent('');
    setShowWrite(false);
    setSubmitting(false);
    fetchPosts();
  };

  const toggleLike = async (post: Post) => {
    await supabase.from('posts').update({ likes: post.likes + 1 }).eq('id', post.id);
    setPosts(prev => prev.map(p => p.id === post.id ? { ...p, likes: p.likes + 1 } : p));
  };

  const toggleComments = async (postId: number) => {
    if (expandedPost === postId) { setExpandedPost(null); return; }
    setExpandedPost(postId);
    if (!comments[postId]) {
      const { data } = await supabase.from('comments').select('*').eq('post_id', postId).order('created_at');
      setComments(prev => ({ ...prev, [postId]: data || [] }));
    }
  };

  const submitComment = async (postId: number) => {
    if (!commentNick.trim() || !commentText.trim()) return;
    const { data } = await supabase.from('comments').insert({
      post_id: postId, nickname: commentNick.trim(), content: commentText.trim()
    }).select().single();
    if (data) {
      setComments(prev => ({ ...prev, [postId]: [...(prev[postId] || []), data] }));
      setCommentText('');
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* 헤더 */}
      <header className="bg-[#0d2d6b] text-white px-4 py-2 flex items-center justify-between shadow-lg shrink-0">
        <div className="flex items-center gap-2.5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/ex-logo.png" alt="EX" style={{ height: '13px', width: 'auto' }} />
          <h1 className="font-bold" style={{ fontSize: '14.6px' }}>
            사용자 피드백 게시판
          </h1>
        </div>
        <Link href="/" className="text-blue-200 text-xs hover:text-white transition-colors">
          ← 앱으로 돌아가기
        </Link>
      </header>

      <main className="flex-1 max-w-2xl w-full mx-auto p-4 flex flex-col gap-4">
        {/* 글쓰기 버튼 */}
        {!showWrite ? (
          <button
            onClick={() => setShowWrite(true)}
            className="w-full bg-white border-2 border-dashed border-gray-200 rounded-2xl px-4 py-3 text-left text-gray-400 text-sm hover:border-blue-300 hover:text-gray-500 transition-colors"
          >
            ✏️ 사용 후기나 개선 의견을 남겨주세요...
          </button>
        ) : (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 flex flex-col gap-3">
            <input
              value={nickname}
              onChange={e => setNickname(e.target.value)}
              placeholder="닉네임"
              className="border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
              maxLength={20}
            />
            <textarea
              value={content}
              onChange={e => setContent(e.target.value)}
              placeholder="내용을 입력하세요 (최대 500자)"
              rows={4}
              maxLength={500}
              className="border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 resize-none"
            />
            <div className="flex gap-2 justify-end">
              <button onClick={() => setShowWrite(false)} className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700">취소</button>
              <button
                onClick={submitPost}
                disabled={submitting || !nickname.trim() || !content.trim()}
                className="bg-[#0d2d6b] text-white px-5 py-2 rounded-xl text-sm font-semibold disabled:opacity-40"
              >
                {submitting ? '등록 중...' : '등록'}
              </button>
            </div>
          </div>
        )}

        {/* 게시글 목록 */}
        {loading ? (
          <div className="flex justify-center py-10">
            <div className="w-8 h-8 border-4 border-blue-100 border-t-[#0d2d6b] rounded-full animate-spin" />
          </div>
        ) : posts.length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            <div className="text-4xl mb-3">💬</div>
            <p>아직 등록된 피드백이 없습니다.</p>
            <p className="text-sm mt-1">첫 번째 의견을 남겨주세요!</p>
          </div>
        ) : (
          posts.map(post => (
            <div key={post.id} className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
              {/* 게시글 본문 */}
              <div className="p-4">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 font-bold text-sm">
                    {post.nickname[0]}
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-gray-800">{post.nickname}</p>
                    <p className="text-xs text-gray-400">{timeAgo(post.created_at)}</p>
                  </div>
                </div>
                <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">{post.content}</p>
              </div>

              {/* 액션 버튼 */}
              <div className="px-4 pb-3 flex items-center gap-4 border-t border-gray-50 pt-3">
                <button
                  onClick={() => toggleLike(post)}
                  className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-red-500 transition-colors"
                >
                  <span>❤️</span>
                  <span>{post.likes}</span>
                </button>
                <button
                  onClick={() => toggleComments(post.id)}
                  className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-blue-500 transition-colors"
                >
                  <span>💬</span>
                  <span>댓글</span>
                  {expandedPost === post.id ? ' ▲' : ' ▼'}
                </button>
              </div>

              {/* 댓글 영역 */}
              {expandedPost === post.id && (
                <div className="border-t border-gray-100 bg-gray-50 p-4 flex flex-col gap-3">
                  {(comments[post.id] || []).map(c => (
                    <div key={c.id} className="flex gap-2">
                      <div className="w-7 h-7 rounded-full bg-gray-200 flex items-center justify-center text-gray-600 font-bold text-xs shrink-0">
                        {c.nickname[0]}
                      </div>
                      <div>
                        <span className="text-xs font-semibold text-gray-700">{c.nickname}</span>
                        <span className="text-xs text-gray-400 ml-1.5">{timeAgo(c.created_at)}</span>
                        <p className="text-sm text-gray-600 mt-0.5">{c.content}</p>
                      </div>
                    </div>
                  ))}
                  {/* 댓글 입력 */}
                  <div className="flex gap-2 mt-1">
                    <input
                      value={commentNick}
                      onChange={e => setCommentNick(e.target.value)}
                      placeholder="닉네임"
                      className="w-20 border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-blue-400"
                      maxLength={10}
                    />
                    <input
                      value={commentText}
                      onChange={e => setCommentText(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && submitComment(post.id)}
                      placeholder="댓글을 입력하세요"
                      className="flex-1 border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-blue-400"
                      maxLength={200}
                    />
                    <button
                      onClick={() => submitComment(post.id)}
                      className="bg-[#0d2d6b] text-white px-3 py-1.5 rounded-lg text-xs font-semibold"
                    >
                      등록
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))
        )}
      </main>
    </div>
  );
}
