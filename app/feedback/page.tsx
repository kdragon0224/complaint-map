'use client';

import { Suspense, useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import { supabase, Post, Comment } from '@/lib/supabase';
import Link from 'next/link';

const ADMIN_PASSWORD = '2504';

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return '방금';
  if (m < 60) return `${m}분 전`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}시간 전`;
  return `${Math.floor(h / 24)}일 전`;
}

interface ReportContext {
  query?: string;
  lat: number;
  lng: number;
  roadType: string;
  routeName: string;
  agency: string;
}

export default function FeedbackPage() {
  return (
    <Suspense fallback={null}>
      <FeedbackPageInner />
    </Suspense>
  );
}

function FeedbackPageInner() {
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [showWrite, setShowWrite] = useState(false);
  const [nickname, setNickname] = useState('');
  const [content, setContent] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [comments, setComments] = useState<Record<number, Comment[]>>({});
  const [commentInputs, setCommentInputs] = useState<Record<number, { nick: string; text: string }>>({});

  // 관리자
  const [isAdmin, setIsAdmin] = useState(false);
  const [showAdminLogin, setShowAdminLogin] = useState(false);
  const [adminPw, setAdminPw] = useState('');
  const [adminError, setAdminError] = useState('');

  // 검색 결과에서 자동 첨부된 신고 컨텍스트 (메인 페이지 "이 결과가 잘못됐나요?" 클릭 시)
  const searchParams = useSearchParams();
  const [reportCtx, setReportCtx] = useState<ReportContext | null>(null);

  useEffect(() => {
    const lat = searchParams.get('reportLat');
    const lng = searchParams.get('reportLng');
    const roadType = searchParams.get('reportRoadType');
    const routeName = searchParams.get('reportRouteName');
    const agency = searchParams.get('reportAgency');
    if (lat && lng && roadType && routeName && agency) {
      setReportCtx({
        query: searchParams.get('reportQuery') ?? undefined,
        lat: parseFloat(lat),
        lng: parseFloat(lng),
        roadType,
        routeName,
        agency,
      });
      setShowWrite(true);
    }
  }, [searchParams]);

  const fetchPosts = useCallback(async () => {
    const { data } = await supabase
      .from('posts')
      .select('*')
      .order('created_at', { ascending: false });
    setPosts(data || []);
    setLoading(false);

    // 댓글은 클릭 없이 항상 보이므로, 게시글과 함께 전체 댓글을 한 번에 불러온다
    const { data: allComments } = await supabase
      .from('comments')
      .select('*')
      .order('created_at');
    const byPost: Record<number, Comment[]> = {};
    for (const c of allComments || []) {
      (byPost[c.post_id] ??= []).push(c);
    }
    setComments(byPost);
  }, []);

  useEffect(() => { fetchPosts(); }, [fetchPosts]);

  const submitPost = async () => {
    if (!nickname.trim() || !content.trim()) return;
    setSubmitting(true);
    await supabase.from('posts').insert({
      nickname: nickname.trim(),
      content: content.trim(),
      ...(reportCtx && {
        report_query: reportCtx.query ?? null,
        report_lat: reportCtx.lat,
        report_lng: reportCtx.lng,
        report_road_type: reportCtx.roadType,
        report_route_name: reportCtx.routeName,
        report_agency: reportCtx.agency,
      }),
    });
    setNickname('');
    setContent('');
    setShowWrite(false);
    setReportCtx(null);
    setSubmitting(false);
    fetchPosts();
  };

  const toggleLike = async (post: Post) => {
    await supabase.from('posts').update({ likes: post.likes + 1 }).eq('id', post.id);
    setPosts(prev => prev.map(p => p.id === post.id ? { ...p, likes: p.likes + 1 } : p));
  };

  const deletePost = async (postId: number) => {
    if (!confirm('이 게시글을 삭제하시겠습니까?')) return;
    await supabase.from('posts').delete().eq('id', postId);
    setPosts(prev => prev.filter(p => p.id !== postId));
  };

  const deleteComment = async (postId: number, commentId: number) => {
    if (!confirm('이 댓글을 삭제하시겠습니까?')) return;
    await supabase.from('comments').delete().eq('id', commentId);
    setComments(prev => ({ ...prev, [postId]: prev[postId].filter(c => c.id !== commentId) }));
  };

  const submitComment = async (postId: number) => {
    const { nick = '', text = '' } = commentInputs[postId] || {};
    if (!nick.trim() || !text.trim()) return;
    const { data } = await supabase.from('comments').insert({
      post_id: postId, nickname: nick.trim(), content: text.trim()
    }).select().single();
    if (data) {
      setComments(prev => ({ ...prev, [postId]: [...(prev[postId] || []), data] }));
      setCommentInputs(prev => ({ ...prev, [postId]: { nick: prev[postId]?.nick ?? '', text: '' } }));
    }
  };

  const handleAdminLogin = () => {
    if (adminPw === ADMIN_PASSWORD) {
      setIsAdmin(true);
      setShowAdminLogin(false);
      setAdminPw('');
      setAdminError('');
    } else {
      setAdminError('비밀번호가 틀렸습니다.');
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* 헤더 */}
      <header className="bg-[#0d2d6b] text-white px-4 py-2 flex items-center justify-between shadow-lg shrink-0">
        <div className="flex items-center gap-2.5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/ex-logo.png" alt="EX" style={{ height: '13px', width: 'auto' }} />
          <h1 className="font-bold" style={{ fontSize: '14.6px' }}>오류 신고 게시판</h1>
        </div>
        <div className="flex items-center gap-2">
          {isAdmin ? (
            <button onClick={() => setIsAdmin(false)} className="text-yellow-300 text-xs font-semibold">
              🔓 관리자 모드
            </button>
          ) : (
            <button onClick={() => setShowAdminLogin(true)} className="text-blue-300 text-xs hover:text-white transition-colors">
              관리자
            </button>
          )}
          <Link href="/admin" className="text-blue-300 text-xs hover:text-white transition-colors">
            관리자 홈
          </Link>
          <Link href="/" className="bg-yellow-400 hover:bg-yellow-300 text-[#0d2d6b] text-xs font-bold px-3 py-1.5 rounded-full transition-colors">
            ← 앱으로
          </Link>
        </div>
      </header>

      {/* 관리자 로그인 모달 */}
      {showAdminLogin && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-xl">
            <h2 className="font-bold text-gray-800 mb-4">관리자 로그인</h2>
            <input
              type="password"
              value={adminPw}
              onChange={e => setAdminPw(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleAdminLogin()}
              placeholder="비밀번호 입력"
              className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 mb-2"
              autoFocus
            />
            {adminError && <p className="text-red-500 text-xs mb-2">{adminError}</p>}
            <div className="flex gap-2 justify-end mt-3">
              <button onClick={() => { setShowAdminLogin(false); setAdminPw(''); setAdminError(''); }} className="px-4 py-2 text-sm text-gray-500">취소</button>
              <button onClick={handleAdminLogin} className="bg-[#0d2d6b] text-white px-5 py-2 rounded-xl text-sm font-semibold">확인</button>
            </div>
          </div>
        </div>
      )}

      <main className="flex-1 max-w-2xl w-full mx-auto p-4 flex flex-col gap-4">
        {isAdmin && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-xl px-4 py-2 text-sm text-yellow-800 font-medium">
            🔓 관리자 모드 — 게시글과 댓글을 삭제할 수 있습니다
          </div>
        )}

        {/* 글쓰기 버튼 */}
        {!showWrite ? (
          <button
            onClick={() => setShowWrite(true)}
            className="w-full bg-white border-2 border-dashed border-gray-200 rounded-2xl px-4 py-3 text-left text-gray-400 text-sm hover:border-blue-300 hover:text-gray-500 transition-colors"
          >
            ✏️ 오류 내용이나 개선 의견을 남겨주세요...
          </button>
        ) : (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 flex flex-col gap-3">
            {reportCtx && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl px-3 py-2.5 text-xs text-gray-700 flex flex-col gap-1">
                <div className="flex items-center justify-between">
                  <p className="font-semibold text-amber-700">📍 신고 대상 검색 정보 (자동 첨부됨)</p>
                  <button
                    onClick={() => setReportCtx(null)}
                    className="text-gray-400 hover:text-gray-600 text-xs shrink-0"
                  >
                    첨부 해제
                  </button>
                </div>
                {reportCtx.query && <p>· 검색어: <span className="font-medium">{reportCtx.query}</span></p>}
                <p>· 좌표: {reportCtx.lat.toFixed(5)}, {reportCtx.lng.toFixed(5)}</p>
                <p>· 판정: {reportCtx.roadType} {reportCtx.routeName}</p>
                <p>· 기관: {reportCtx.agency}</p>
              </div>
            )}
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
              placeholder="오류 내용 또는 개선 의견을 입력하세요 (최대 500자)"
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
            <p>아직 등록된 내용이 없습니다.</p>
            <p className="text-sm mt-1">첫 번째 의견을 남겨주세요!</p>
          </div>
        ) : (
          posts.map(post => (
            <div key={post.id} className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
              <div className="p-4">
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 font-bold text-sm shrink-0">
                      {post.nickname[0]}
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-gray-800">{post.nickname}</p>
                      <p className="text-xs text-gray-400">{timeAgo(post.created_at)}</p>
                    </div>
                  </div>
                  {isAdmin && (
                    <button
                      onClick={() => deletePost(post.id)}
                      className="shrink-0 text-xs text-red-400 hover:text-red-600 hover:bg-red-50 px-2 py-1 rounded-lg transition-colors font-medium"
                    >
                      🗑 삭제
                    </button>
                  )}
                </div>
                <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">{post.content}</p>

                {post.report_lat != null && post.report_lng != null && (
                  <div className="mt-3 bg-gray-50 border border-gray-100 rounded-xl px-3 py-2.5 text-xs text-gray-600 flex flex-col gap-1">
                    <p className="font-semibold text-gray-500">📍 신고된 검색 정보</p>
                    {post.report_query && <p>· 검색어: {post.report_query}</p>}
                    <p>· 좌표: {post.report_lat.toFixed(5)}, {post.report_lng.toFixed(5)}</p>
                    {post.report_road_type && <p>· 판정: {post.report_road_type} {post.report_route_name}</p>}
                    {post.report_agency && <p>· 기관: {post.report_agency}</p>}
                    <a
                      href={`/?lat=${post.report_lat}&lng=${post.report_lng}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-600 hover:underline font-medium mt-1 inline-block w-fit"
                    >
                      🗺️ 지도에서 위치 확인 →
                    </a>
                  </div>
                )}
              </div>

              <div className="px-4 pb-3 flex items-center gap-4 border-t border-gray-50 pt-3">
                <button onClick={() => toggleLike(post)} className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-red-500 transition-colors">
                  <span>❤️</span><span>{post.likes}</span>
                </button>
                <span className="flex items-center gap-1.5 text-sm text-gray-500">
                  <span>💬</span><span>댓글 {(comments[post.id] || []).length}</span>
                </span>
              </div>

              <div className="border-t border-gray-100 bg-gray-50 p-4 flex flex-col gap-3">
                  {(comments[post.id] || []).map(c => (
                    <div key={c.id} className="flex gap-2 items-start">
                      <div className="w-7 h-7 rounded-full bg-gray-200 flex items-center justify-center text-gray-600 font-bold text-xs shrink-0">
                        {c.nickname[0]}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between">
                          <div>
                            <span className="text-xs font-semibold text-gray-700">{c.nickname}</span>
                            <span className="text-xs text-gray-400 ml-1.5">{timeAgo(c.created_at)}</span>
                          </div>
                          {isAdmin && (
                            <button
                              onClick={() => deleteComment(post.id, c.id)}
                              className="text-xs text-red-400 hover:text-red-600 px-1.5 py-0.5 rounded transition-colors"
                            >
                              🗑
                            </button>
                          )}
                        </div>
                        <p className="text-sm text-gray-600 mt-0.5">{c.content}</p>
                      </div>
                    </div>
                  ))}
                  <div className="flex gap-2 mt-1">
                    <input
                      value={commentInputs[post.id]?.nick ?? ''}
                      onChange={e => setCommentInputs(prev => ({ ...prev, [post.id]: { ...prev[post.id], nick: e.target.value } }))}
                      placeholder="닉네임"
                      className="w-20 border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-blue-400"
                      maxLength={10}
                    />
                    <input
                      value={commentInputs[post.id]?.text ?? ''}
                      onChange={e => setCommentInputs(prev => ({ ...prev, [post.id]: { ...prev[post.id], text: e.target.value } }))}
                      onKeyDown={e => e.key === 'Enter' && submitComment(post.id)}
                      placeholder="댓글을 입력하세요"
                      className="flex-1 border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-blue-400"
                      maxLength={200}
                    />
                    <button onClick={() => submitComment(post.id)} className="bg-[#0d2d6b] text-white px-3 py-1.5 rounded-lg text-xs font-semibold">
                      등록
                    </button>
                  </div>
                </div>
            </div>
          ))
        )}
      </main>
    </div>
  );
}
