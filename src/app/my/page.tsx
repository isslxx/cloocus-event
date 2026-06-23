'use client';

import { useState, useEffect } from 'react';
import { INDUSTRIES, COMPANY_SIZES, REFERRAL_SOURCES } from '@/lib/constants';
import { formatPhone } from '@/lib/validation';
import { trackCertificateDownload, trackCertificateDownloadFailed, trackSurveyComplete, trackPortalLogin, trackInquirySubmit, trackRegistrationCancel } from '@/lib/analytics';
import { trackView, trackClick } from '@/lib/tracker';
import { captureAttribution } from '@/lib/utm';
import { DEFAULT_SURVEY_QUESTIONS, type SurveyQuestion, type SurveyAnswer } from '@/lib/survey-questions';

const SURVEY_ETC_LABEL = '기타';
const SURVEY_ETC_PREFIX = '기타: ';

type RegistrationData = {
  id: string;
  name: string;
  company_name: string;
  department: string;
  job_title: string;
  email: string;
  phone: string;
  industry: string;
  company_size: string;
  referral_source: string;
  referrer_name: string;
  inquiry: string;
  custom_answers?: Record<string, string | string[] | boolean> | null;
  survey_feedback?: string | null;
  event_id: string;
  registration_status: string;
  event_name: string;
  event_date: string;
  event_type: string;
  event_category: string;
  event_location: string;
  event_promo_url?: string | null;
  event_time: string;
  survey_enabled: boolean;
  survey_completed: boolean;
  event_status: string;
  event_ended_at: string | null;
  created_at: string;
  inquiry_status: string;
};

type FAQCategory = {
  id: string;
  name: string;
  icon: string;
  sort_order: number;
};

type FAQItem = {
  id: string;
  question: string;
  answer: string;
  category_id: string | null;
};

function BrandFooter() {
  return (
    <footer className="py-4 sm:py-5 px-4 border-t border-gray-200" style={{ backgroundColor: '#eef0f4' }}>
      <div className="max-w-lg mx-auto text-center">
        <div className="flex items-center justify-center gap-2 sm:gap-2.5 mb-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/cloocus-logo.png" alt="Cloocus" className="h-4 sm:h-5" />
          <span className="text-gray-300">|</span>
          <span className="text-xs sm:text-sm text-gray-600 font-medium">(주)클루커스</span>
        </div>
        <p className="text-[10px] sm:text-xs text-gray-500 leading-relaxed">
          본사ㅣ서울특별시 강남구 논현로75길 6 (역삼동, 에비뉴75)<br className="sm:hidden" /><span className="hidden sm:inline"> | </span>02-597-3400
        </p>
        <p className="text-[10px] sm:text-xs text-gray-500 mt-1">
          marketing@cloocus.com
        </p>
      </div>
    </footer>
  );
}

// 단일 설문 문항 렌더러. 메인 설문 화면과 통합 모드(개인정보+설문) 양쪽에서 공유.
// "기타" 옵션이 multiple 타입에 포함돼 있으면 선택 시 자유 입력란이 같이 노출된다.
function SurveyQuestionField({
  q, index, answer, etc, error, etcError,
  onSingleChange, onMultiToggle, onTextChange, onEtcChange,
  inputNamePrefix = 'q',
}: {
  q: SurveyQuestion;
  index: number;
  answer: string | string[] | undefined;
  etc: string;
  error?: string;
  etcError?: string;
  onSingleChange: (v: string) => void;
  onMultiToggle: (opt: string) => void;
  onTextChange: (v: string) => void;
  onEtcChange: (v: string) => void;
  inputNamePrefix?: string;
}) {
  const num = index + 1;
  const radioName = `${inputNamePrefix}${num}`;
  const selectedMulti = Array.isArray(answer) ? answer : [];
  const selectedSingle = typeof answer === 'string' ? answer : '';

  return (
    <div>
      <p className="text-sm font-medium text-gray-800 mb-2">
        {num}. {q.question_text}{q.required && <span className="text-red-500"> *</span>}
      </p>

      {q.question_type === 'single' && q.options.map((opt) => (
        <label key={opt} className="flex items-center gap-2 py-1.5 cursor-pointer">
          <input
            type="radio"
            name={radioName}
            value={opt}
            checked={selectedSingle === opt}
            onChange={(e) => onSingleChange(e.target.value)}
            className="w-4 h-4 accent-blue-600"
          />
          <span className="text-sm text-gray-700">{opt}</span>
        </label>
      ))}

      {q.question_type === 'multiple' && (
        <>
          {q.options.map((opt) => (
            <label key={opt} className="flex items-center gap-2 py-1.5 cursor-pointer">
              <input
                type="checkbox"
                checked={selectedMulti.includes(opt)}
                onChange={() => onMultiToggle(opt)}
                className="w-4 h-4 accent-blue-600"
              />
              <span className="text-sm text-gray-700">{opt}</span>
            </label>
          ))}
          {selectedMulti.includes(SURVEY_ETC_LABEL) && (
            <input
              type="text"
              value={etc}
              onChange={(e) => onEtcChange(e.target.value)}
              placeholder="기타 내용을 입력해주세요"
              className="mt-1 w-full"
              style={{ padding: '8px 12px', border: `1px solid ${etcError ? '#ef4444' : '#e0e0e0'}`, borderRadius: 8, fontSize: 14 }}
            />
          )}
        </>
      )}

      {q.question_type === 'text' && (
        <textarea
          rows={4}
          value={selectedSingle}
          onChange={(e) => onTextChange(e.target.value)}
          placeholder="자유롭게 작성해주세요"
          className="w-full"
          style={{ padding: '10px 12px', border: '1px solid #e0e0e0', borderRadius: 8, fontSize: 14 }}
        />
      )}

      {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
      {etcError && <p className="text-xs text-red-500 mt-1">{etcError}</p>}
    </div>
  );
}

export default function MyDashboard() {
  const [authenticated, setAuthenticated] = useState(false);
  // sessionStorage 에 세션이 있는지 확인하는 동안엔 로그인 폼/포탈 어느 쪽도 안 보여줌.
  // SSR/첫 페인트엔 무조건 true 로 시작 → useEffect 가 즉시 false 로 바꿈.
  // 세션이 없으면 false 로, 있으면 lookup 후 false 로.
  const [sessionRestoring, setSessionRestoring] = useState(true);
  const [lookupEmail, setLookupEmail] = useState('');
  const [lookupPin, setLookupPin] = useState('');
  const [lookupEventId, setLookupEventId] = useState('');
  const [lookupError, setLookupError] = useState('');
  const [lookupLoading, setLookupLoading] = useState(false);
  const [pin, setPin] = useState('');
  const [allEvents, setAllEvents] = useState<{ id: string; name: string }[]>([]);

  // 여러 이벤트 선택
  const [multipleEvents, setMultipleEvents] = useState<{ id: string; event_name: string; event_date: string; registration_status: string }[]>([]);
  const [showEventSelect, setShowEventSelect] = useState(false);

  const [registration, setRegistration] = useState<RegistrationData | null>(null);
  const [editable, setEditable] = useState(false);
  const [faqs, setFaqs] = useState<FAQItem[]>([]);
  const [faqCategories, setFaqCategories] = useState<FAQCategory[]>([]);
  const [openFaqId, setOpenFaqId] = useState<string | null>(null);
  const [faqSearch, setFaqSearch] = useState('');
  const [openCategoryId, setOpenCategoryId] = useState<string | null>(null);

  // 문의 대응 시스템
  const [inquiryComments, setInquiryComments] = useState<{ id: string; author_type: string; author_name: string; content: string; created_at: string }[]>([]);
  const [inquiryStatus, setInquiryStatus] = useState<string>('pending');
  const [newInquiry, setNewInquiry] = useState('');
  const [inquirySubmitting, setInquirySubmitting] = useState(false);

  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [cancelled, setCancelled] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);

  const [showSurvey, setShowSurvey] = useState(false);
  const [showSurveyChoice, setShowSurveyChoice] = useState(false);
  const [surveySubmitted, setSurveySubmitted] = useState(false);
  // 동적 설문: 질문은 /api/survey-questions 에서 받아온다. 응답은 question_id → 값 매핑.
  // 기타 선택 시 별도 question_id → 기타 입력 매핑.
  const [surveyQuestions, setSurveyQuestions] = useState<SurveyQuestion[]>(DEFAULT_SURVEY_QUESTIONS);
  const [surveyAnswers, setSurveyAnswers] = useState<Record<string, string | string[]>>({});
  const [surveyEtc, setSurveyEtc] = useState<Record<string, string>>({});
  const [surveyErrors, setSurveyErrors] = useState<Record<string, string>>({});
  const [surveySubmitting, setSurveySubmitting] = useState(false);
  const [surveyValidationPopup, setSurveyValidationPopup] = useState<string[]>([]);
  const [surveyWithEdit, setSurveyWithEdit] = useState(false); // 개인정보 수정+설문 통합 모드

  // 수정 모드
  const [editMode, setEditMode] = useState(false);
  const [editForm, setEditForm] = useState<Record<string, string>>({});
  const [editErrors, setEditErrors] = useState<Record<string, string>>({});
  const [editSubmitting, setEditSubmitting] = useState(false);
  const [editServerError, setEditServerError] = useState('');

  // 폼 옵션
  const [formOptions, setFormOptions] = useState<Record<string, string[]>>({});

  // 이벤트 전용 추가 문항 (조회·수정 시 사용)
  type CustomQuestion = {
    id: string;
    question_type: 'short_text' | 'long_text' | 'single_choice' | 'multi_choice' | 'agreement';
    label: string;
    description: string | null;
    options: { label: string }[];
    required: boolean;
    allow_etc: boolean;
  };
  type CustomAnswerValue = string | string[] | boolean;
  const [customQuestions, setCustomQuestions] = useState<CustomQuestion[]>([]);
  const [editCustomAnswers, setEditCustomAnswers] = useState<Record<string, CustomAnswerValue>>({});
  const [editCustomEtc, setEditCustomEtc] = useState<Record<string, string>>({});
  const [editCustomErrors, setEditCustomErrors] = useState<Record<string, string>>({});

  // verify 카드용 QR (외부 서비스 호출 없이 클라이언트에서 생성)
  const [verifyQrDataUrl, setVerifyQrDataUrl] = useState<string>('');

  const ETC_LABEL = '기타';
  const ETC_PREFIX = '기타: ';

  // 로그인 후 대시보드에선 layout-level Soft Mesh 숨김 (로그인 화면은 그대로 노출)
  useEffect(() => {
    if (authenticated) {
      document.body.classList.add('mesh-hide');
      return () => document.body.classList.remove('mesh-hide');
    }
  }, [authenticated]);

  // verify QR 생성 — 외부 QR 서비스 의존 제거를 위해 클라이언트에서 dataURL 로 직접 생성한다.
  useEffect(() => {
    if (!registration?.id) {
      setVerifyQrDataUrl('');
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        // qrcode 는 순수 CJS 패키지라 번들러에 따라 .default 가 비어 올 수 있어 양쪽 호환 처리.
        const qrMod = await import('qrcode');
        const QRCode = (qrMod as unknown as { default?: typeof qrMod }).default ?? qrMod;
        const url = `${window.location.origin}/verify/${registration.id}`;
        const dataUrl = await QRCode.toDataURL(url, {
          width: 400,
          margin: 1,
          errorCorrectionLevel: 'M',
        });
        if (!cancelled) setVerifyQrDataUrl(dataUrl);
      } catch (err) {
        console.error('[my] verify QR 생성 실패:', err);
        if (!cancelled) setVerifyQrDataUrl('');
      }
    })();
    return () => { cancelled = true; };
  }, [registration?.id]);

  useEffect(() => {
    captureAttribution();
    trackView('/my');
    fetch('/api/form-options').then((r) => r.json()).then((d) => setFormOptions(d)).catch(() => {});
    fetch('/api/events').then((r) => r.json()).then((d) => setAllEvents(Array.isArray(d) ? d.map((e: { id: string; name: string }) => ({ id: e.id, name: e.name })) : [])).catch(() => {});
    // FAQ 프리페치: 로그인 전에 미리 받아두기
    fetch('/api/faqs').then((r) => r.json()).then((d) => {
      setFaqs(Array.isArray(d?.faqs) ? d.faqs : []);
      setFaqCategories(Array.isArray(d?.categories) ? d.categories : []);
    }).catch(() => {});

    // 새로고침 시 세션 복원 — 직전 로그인 자격증명 + lookup 응답 캐시를 sessionStorage 에 보관.
    // 캐시가 있으면 즉시 렌더 (스피너 안 뜸) + 백그라운드 fetch 로 최신 데이터 갱신.
    let hasSession = false;
    try {
      const raw = sessionStorage.getItem('cloocus_my_session');
      const cachedRaw = sessionStorage.getItem('cloocus_my_data');
      if (raw) {
        const sess = JSON.parse(raw) as { email?: string; pin?: string; event_id?: string };
        if (sess?.email && /^\d{4}$/.test(sess?.pin || '')) {
          hasSession = true;
          setLookupEmail(sess.email);
          setLookupPin(sess.pin!);
          if (sess.event_id) setLookupEventId(sess.event_id);
          setPin(sess.pin!);

          // 캐시된 응답이 있으면 즉시 렌더 → sessionRestoring 즉시 false
          let cachedApplied = false;
          if (cachedRaw) {
            try {
              const cached = JSON.parse(cachedRaw) as {
                registration?: RegistrationData;
                custom_questions?: CustomQuestion[];
                editable?: boolean;
                multiple?: boolean;
                registrations?: { id: string; event_name: string; event_date: string; registration_status: string }[];
              };
              if (cached.multiple && Array.isArray(cached.registrations)) {
                setMultipleEvents(cached.registrations);
                setShowEventSelect(true);
                setAuthenticated(true);
                cachedApplied = true;
              } else if (cached.registration) {
                setRegistration(cached.registration);
                setCustomQuestions(Array.isArray(cached.custom_questions) ? cached.custom_questions : []);
                setEditable(!!cached.editable);
                setAuthenticated(true);
                cachedApplied = true;
              }
            } catch { /* 캐시 손상 — 무시 */ }
          }
          if (cachedApplied) setSessionRestoring(false);

          // 백그라운드(또는 cachedApplied=false 면 포그라운드) 로 최신 데이터 갱신
          fetch('/api/register/lookup', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: sess.email, pin: sess.pin, event_id: sess.event_id || undefined }),
          })
            .then((r) => r.json().then((d) => ({ ok: r.ok, d })))
            .then(({ ok, d }) => {
              if (!ok) {
                sessionStorage.removeItem('cloocus_my_session');
                sessionStorage.removeItem('cloocus_my_data');
                if (!cachedApplied) {
                  // 인증 실패 + 캐시도 없음 → 로그인 폼 노출
                  setAuthenticated(false);
                }
                return;
              }
              try { sessionStorage.setItem('cloocus_my_data', JSON.stringify(d)); } catch { /* ignore */ }
              if (d.multiple) {
                setMultipleEvents(d.registrations);
                setShowEventSelect(true);
                setAuthenticated(true);
              } else {
                setRegistration(d.registration);
                setCustomQuestions(Array.isArray(d.custom_questions) ? d.custom_questions : []);
                setEditable(d.editable);
                setAuthenticated(true);
              }
            })
            .catch(() => {
              if (!cachedApplied) {
                try { sessionStorage.removeItem('cloocus_my_session'); sessionStorage.removeItem('cloocus_my_data'); } catch { /* ignore */ }
              }
            })
            .finally(() => { if (!cachedApplied) setSessionRestoring(false); });
        }
      }
    } catch { /* sessionStorage 미지원 환경 무시 */ }
    // 세션이 없으면 즉시 복원 종료 — 로그인 폼이 바로 보이도록
    if (!hasSession) setSessionRestoring(false);
  }, []);

  // (이전에 customQuestions 를 자동 정리하는 useEffect 가 있었으나, 마운트 시점에
  // registration 의 새 값을 못 봐서 캐시 복원 직후 customQuestions 를 [] 로 덮어쓰던
  // 버그가 있어 제거함. 모든 lookup/cache/load 경로에서 명시적으로 setCustomQuestions
  // 를 호출하므로 별도 정리 effect 는 불필요.)

  // 등록 정보가 로드되면 설문 활성 여부와 무관하게 질문을 받아둔다.
  // (활성 이벤트도 admin 이 언제든 토글할 수 있으므로 미리 가져두면 진입 시 깜빡임 없음)
  useEffect(() => {
    if (!registration?.event_id) return;
    fetch(`/api/survey-questions?event_id=${registration.event_id}`)
      .then((r) => r.json())
      .then((d) => {
        if (Array.isArray(d?.questions) && d.questions.length > 0) {
          setSurveyQuestions(d.questions);
        }
      })
      .catch(() => { /* fallback 기본 6문항 사용 */ });
  }, [registration?.event_id]);

  // 동적 설문 폼: 단일 응답 갱신
  const setSingleAnswer = (qid: string, value: string) => {
    setSurveyAnswers((prev) => ({ ...prev, [qid]: value }));
    setSurveyErrors((prev) => ({ ...prev, [qid]: '' }));
  };
  // 동적 설문 폼: 복수 응답 토글
  const toggleMultiAnswer = (qid: string, opt: string) => {
    setSurveyAnswers((prev) => {
      const cur = Array.isArray(prev[qid]) ? (prev[qid] as string[]) : [];
      const next = cur.includes(opt) ? cur.filter((v) => v !== opt) : [...cur, opt];
      // 기타 해제 시 입력값도 함께 비움
      if (opt === SURVEY_ETC_LABEL && !next.includes(SURVEY_ETC_LABEL)) {
        setSurveyEtc((etc) => ({ ...etc, [qid]: '' }));
      }
      return { ...prev, [qid]: next };
    });
    setSurveyErrors((prev) => ({ ...prev, [qid]: '' }));
  };
  // 동적 설문 폼: 텍스트 응답
  const setTextAnswer = (qid: string, value: string) => {
    setSurveyAnswers((prev) => ({ ...prev, [qid]: value }));
  };
  // 동적 설문 폼: 기타 입력
  const setEtcAnswer = (qid: string, value: string) => {
    setSurveyEtc((prev) => ({ ...prev, [qid]: value }));
    setSurveyErrors((prev) => ({ ...prev, [`${qid}_etc`]: '' }));
  };

  // 현재 surveyAnswers + surveyEtc 를 서버 전송용 payload 로 변환
  const buildSurveyAnswers = (): SurveyAnswer[] => {
    const out: SurveyAnswer[] = [];
    for (const q of surveyQuestions) {
      const v = surveyAnswers[q.id];
      if (q.question_type === 'single') {
        if (typeof v === 'string' && v.trim()) {
          out.push({ question_id: q.id, question_text: q.question_text, question_type: q.question_type, value: v });
        }
      } else if (q.question_type === 'multiple') {
        const arr = Array.isArray(v) ? v : [];
        const final = arr.map((x) => x === SURVEY_ETC_LABEL ? `${SURVEY_ETC_PREFIX}${(surveyEtc[q.id] || '').trim()}` : x);
        if (final.length > 0) {
          out.push({ question_id: q.id, question_text: q.question_text, question_type: q.question_type, value: final });
        }
      } else if (q.question_type === 'text') {
        if (typeof v === 'string' && v.trim()) {
          out.push({ question_id: q.id, question_text: q.question_text, question_type: q.question_type, value: v });
        }
      }
    }
    return out;
  };

  // 동적 설문 검증 — 인덱스(1,2,…)도 메시지에 포함해 사용자에게 어느 문항인지 명확히 안내
  const validateSurvey = (): { errors: Record<string, string>; messages: string[] } => {
    const errors: Record<string, string> = {};
    const messages: string[] = [];
    surveyQuestions.forEach((q, idx) => {
      const num = idx + 1;
      const v = surveyAnswers[q.id];
      if (!q.required) return;
      if (q.question_type === 'single') {
        if (typeof v !== 'string' || !v.trim()) {
          const msg = `${num}번 항목을 선택해주세요.`;
          errors[q.id] = msg;
          messages.push(msg);
        }
      } else if (q.question_type === 'multiple') {
        const arr = Array.isArray(v) ? v : [];
        if (arr.length === 0) {
          const msg = `${num}번 항목을 하나 이상 선택해주세요.`;
          errors[q.id] = msg;
          messages.push(msg);
        } else if (arr.includes(SURVEY_ETC_LABEL) && !(surveyEtc[q.id] || '').trim()) {
          const msg = `${num}번 기타 내용을 입력해주세요.`;
          errors[`${q.id}_etc`] = msg;
          messages.push(msg);
        }
      } else if (q.question_type === 'text') {
        if (typeof v !== 'string' || !v.trim()) {
          const msg = `${num}번 항목을 입력해주세요.`;
          errors[q.id] = msg;
          messages.push(msg);
        }
      }
    });
    return { errors, messages };
  };

  // 저장된 설문 응답을 surveyAnswers/surveyEtc state 로 복원
  // answers JSONB 우선, 없으면 legacy q1~q6 컬럼으로 복원
  const hydrateSurveyFromRecord = (survey: Record<string, unknown>) => {
    const ans: Record<string, string | string[]> = {};
    const etc: Record<string, string> = {};
    const answersJson = Array.isArray(survey?.answers) ? (survey.answers as SurveyAnswer[]) : [];

    // 새 포맷 우선
    if (answersJson.length > 0) {
      for (const a of answersJson) {
        if (Array.isArray(a.value)) {
          const cleaned = a.value.map((v) => {
            if (typeof v === 'string' && v.startsWith(SURVEY_ETC_PREFIX)) {
              etc[a.question_id] = v.slice(SURVEY_ETC_PREFIX.length);
              return SURVEY_ETC_LABEL;
            }
            return v;
          });
          ans[a.question_id] = cleaned;
        } else if (typeof a.value === 'string') {
          ans[a.question_id] = a.value;
        }
      }
    } else {
      // legacy 6문항 매핑
      const legacy = [
        { key: 'q1_azure_level', qid: DEFAULT_SURVEY_QUESTIONS[0].id },
        { key: 'q2_difficulty',  qid: DEFAULT_SURVEY_QUESTIONS[1].id },
        { key: 'q3_purpose',     qid: DEFAULT_SURVEY_QUESTIONS[2].id },
        { key: 'q4_adoption',    qid: DEFAULT_SURVEY_QUESTIONS[3].id },
        { key: 'q5_consulting',  qid: DEFAULT_SURVEY_QUESTIONS[4].id },
        { key: 'q6_feedback',    qid: DEFAULT_SURVEY_QUESTIONS[5].id },
      ];
      for (const { key, qid } of legacy) {
        const v = survey[key];
        if (Array.isArray(v)) {
          const cleaned = v.map((x: string) => {
            if (typeof x === 'string' && x.startsWith(SURVEY_ETC_PREFIX)) {
              etc[qid] = x.slice(SURVEY_ETC_PREFIX.length);
              return SURVEY_ETC_LABEL;
            }
            return x;
          });
          ans[qid] = cleaned;
        } else if (typeof v === 'string') {
          ans[qid] = v;
        }
      }
    }

    setSurveyAnswers(ans);
    setSurveyEtc(etc);
  };

  const startEdit = () => {
    if (!registration) return;
    // 기타 값 분리
    let industry = registration.industry;
    let industry_etc = '';
    if (industry?.startsWith('기타: ')) { industry_etc = industry.replace('기타: ', ''); industry = '기타'; }
    let referral_source = registration.referral_source;
    let referral_source_etc = '';
    if (referral_source?.startsWith('기타: ')) { referral_source_etc = referral_source.replace('기타: ', ''); referral_source = '기타'; }

    setEditForm({
      name: registration.name,
      company_name: registration.company_name,
      department: registration.department,
      job_title: registration.job_title,
      email: registration.email,
      phone: registration.phone,
      industry,
      industry_etc,
      company_size: registration.company_size,
      referral_source,
      referral_source_etc,
      referrer_name: registration.referrer_name || '',
      inquiry: registration.inquiry || '',
    });
    // 커스텀 문항 응답 초기화 — "기타: <텍스트>" 형태는 분리해서 표시/편집
    const ans = (registration.custom_answers || {}) as Record<string, CustomAnswerValue>;
    const initAnswers: Record<string, CustomAnswerValue> = {};
    const initEtc: Record<string, string> = {};
    for (const q of customQuestions) {
      const v = ans[q.id];
      if (q.question_type === 'single_choice' && typeof v === 'string' && v.startsWith(ETC_PREFIX)) {
        initAnswers[q.id] = ETC_LABEL;
        initEtc[q.id] = v.slice(ETC_PREFIX.length);
      } else if (q.question_type === 'multi_choice' && Array.isArray(v)) {
        const out: string[] = [];
        for (const item of v) {
          if (typeof item === 'string' && item.startsWith(ETC_PREFIX)) {
            out.push(ETC_LABEL);
            initEtc[q.id] = item.slice(ETC_PREFIX.length);
          } else if (typeof item === 'string') {
            out.push(item);
          }
        }
        initAnswers[q.id] = out;
      } else if (v !== undefined) {
        initAnswers[q.id] = v;
      } else {
        if (q.question_type === 'multi_choice') initAnswers[q.id] = [];
        else if (q.question_type === 'agreement') initAnswers[q.id] = false;
        else initAnswers[q.id] = '';
      }
    }
    setEditCustomAnswers(initAnswers);
    setEditCustomEtc(initEtc);
    setEditCustomErrors({});
    setEditErrors({});
    setEditServerError('');
    setEditMode(true);
  };

  const handleEditSubmit = async () => {
    // 간단 검증
    const errs: Record<string, string> = {};
    if (!editForm.name?.trim()) errs.name = '성함을 입력해주세요.';
    if (!editForm.company_name?.trim()) errs.company_name = '회사명을 입력해주세요.';
    if (!editForm.department?.trim()) errs.department = '부서명을 입력해주세요.';
    if (!editForm.job_title?.trim()) errs.job_title = '직급을 입력해주세요.';
    if (!editForm.email?.trim()) errs.email = '이메일을 입력해주세요.';
    if (!editForm.phone?.trim()) errs.phone = '연락처를 입력해주세요.';
    if (!editForm.industry) errs.industry = '산업군을 선택해주세요.';
    if (!editForm.company_size) errs.company_size = '기업 규모를 선택해주세요.';
    if (!editForm.referral_source) errs.referral_source = '신청 경로를 선택해주세요.';
    if (editForm.industry === '기타' && !editForm.industry_etc?.trim()) errs.industry_etc = '산업군을 입력해주세요.';
    if (editForm.referral_source === '기타' && !editForm.referral_source_etc?.trim()) errs.referral_source_etc = '신청 경로를 입력해주세요.';

    // 커스텀 문항 검증
    const cErrs: Record<string, string> = {};
    for (const q of customQuestions) {
      const v = editCustomAnswers[q.id];
      const etcText = (editCustomEtc[q.id] || '').trim();
      if (q.allow_etc) {
        if (q.question_type === 'single_choice' && v === ETC_LABEL && !etcText) {
          cErrs[q.id] = '기타 내용을 입력해주세요.';
          continue;
        }
        if (q.question_type === 'multi_choice' && Array.isArray(v) && v.includes(ETC_LABEL) && !etcText) {
          cErrs[q.id] = '기타 내용을 입력해주세요.';
          continue;
        }
      }
      if (!q.required) continue;
      const empty =
        (q.question_type === 'multi_choice' && Array.isArray(v) && v.length === 0) ||
        (q.question_type === 'agreement' && v !== true) ||
        ((q.question_type === 'short_text' || q.question_type === 'long_text' || q.question_type === 'single_choice') && (typeof v !== 'string' || !v.trim()));
      if (empty) {
        cErrs[q.id] = q.question_type === 'agreement' ? '동의가 필요합니다.' : '필수 항목입니다.';
      }
    }
    setEditCustomErrors(cErrs);

    setEditErrors(errs);
    if (Object.keys(errs).length > 0 || Object.keys(cErrs).length > 0) return;

    // 제출용 custom_answers — "기타" 선택 + etc 텍스트를 "기타: <텍스트>" 로 합침
    const submitCustomAnswers: Record<string, CustomAnswerValue> = {};
    for (const q of customQuestions) {
      const v = editCustomAnswers[q.id];
      const etcText = (editCustomEtc[q.id] || '').trim();
      if (q.allow_etc && q.question_type === 'single_choice' && v === ETC_LABEL && etcText) {
        submitCustomAnswers[q.id] = `${ETC_PREFIX}${etcText}`;
        continue;
      }
      if (q.allow_etc && q.question_type === 'multi_choice' && Array.isArray(v) && v.includes(ETC_LABEL)) {
        submitCustomAnswers[q.id] = v.map((item) => (item === ETC_LABEL && etcText ? `${ETC_PREFIX}${etcText}` : item));
        continue;
      }
      submitCustomAnswers[q.id] = v;
    }

    setEditSubmitting(true);
    setEditServerError('');
    try {
      const res = await fetch(`/api/register/${registration!.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...editForm, pin, custom_answers: submitCustomAnswers }),
      });
      const data = await res.json();
      if (!res.ok) {
        setEditServerError(data.error || '수정에 실패했습니다.');
        return;
      }
      // 수정 성공 → 다시 조회
      const lookupRes = await fetch('/api/register/lookup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: editForm.email || registration!.email, pin }),
      });
      const lookupData = await lookupRes.json();
      if (lookupRes.ok) {
        setRegistration(lookupData.registration);
        setCustomQuestions(Array.isArray(lookupData.custom_questions) ? lookupData.custom_questions : []);
        setEditable(lookupData.editable);
        // 캐시 갱신
        try { sessionStorage.setItem('cloocus_my_data', JSON.stringify(lookupData)); } catch { /* ignore */ }
      }
      setEditMode(false);
      // 설문 활성화 상태면 수정 후 바로 설문 폼 열기
      if (registration?.survey_enabled && !registration?.survey_completed) {
        setShowSurvey(true);
      }
    } catch {
      setEditServerError('네트워크 오류가 발생했습니다.');
    } finally {
      setEditSubmitting(false);
    }
  };

  const offlineCategories = ['세미나', '워크샵', '전시회', '스프린트'];
  const showStatus = registration && !['프로모션', '이벤트'].includes(registration.event_category);
  const showQr = registration?.registration_status === 'confirmed' && offlineCategories.includes(registration.event_category);

  // 종료 후 7일 접근 제한
  const isEventEnded = registration?.event_status === 'ended';
  const endedAt = registration?.event_ended_at ? new Date(registration.event_ended_at) : null;
  const endedDaysAgo = endedAt ? Math.floor((Date.now() - endedAt.getTime()) / (1000 * 60 * 60 * 24)) : 0;
  const isAccessExpired = isEventEnded && endedAt && endedDaysAgo > 7;
  const daysRemaining = isEventEnded && endedAt ? Math.max(0, 7 - endedDaysAgo) : null;

  // 마감/종료 시 개인정보 수정 불가 (editable 재정의)
  const canEditInfo = editable && registration?.event_status === 'open' && registration?.registration_status === 'pending';
  // 설문 수정 가능: 확정자 + 이벤트 날짜 이전
  const eventDatePassed = registration?.event_date ? new Date(registration.event_date) < new Date() : false;
  const canEditSurvey = registration?.registration_status === 'confirmed' && !isAccessExpired && (registration?.event_status !== 'ended');

  const handleLookup = async () => {
    if (!lookupEventId) { setLookupError('이벤트를 선택해주세요.'); return; }
    if (!lookupEmail.trim()) { setLookupError('이메일을 입력해주세요.'); return; }
    if (!/^\d{4}$/.test(lookupPin)) { setLookupError('확인 암호 4자리 숫자를 입력해주세요.'); return; }
    setLookupLoading(true);
    setLookupError('');
    try {
      const res = await fetch('/api/register/lookup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: lookupEmail, pin: lookupPin, event_id: lookupEventId }),
      });
      const data = await res.json();
      if (!res.ok) { setLookupError(data.error || '조회에 실패했습니다.'); return; }
      setPin(lookupPin);

      // 새로고침 시 자동 복원되도록 세션 + 응답 캐시 보관
      try {
        sessionStorage.setItem('cloocus_my_session', JSON.stringify({
          email: lookupEmail,
          pin: lookupPin,
          event_id: lookupEventId || undefined,
        }));
        sessionStorage.setItem('cloocus_my_data', JSON.stringify(data));
      } catch { /* ignore */ }

      // 여러 이벤트에 등록한 경우
      if (data.multiple) {
        setMultipleEvents(data.registrations);
        setShowEventSelect(true);
        setAuthenticated(true);
        return;
      }

      setRegistration(data.registration);
      setCustomQuestions(Array.isArray(data.custom_questions) ? data.custom_questions : []);
      setEditable(data.editable);
      setAuthenticated(true);
      trackPortalLogin();

      // FAQ는 이미 프리페치됨 → 캐시가 비어있을 경우에만 재시도
      if (faqs.length === 0 && faqCategories.length === 0) {
        fetch('/api/faqs').then((r) => r.json()).then((d) => {
          setFaqs(Array.isArray(d?.faqs) ? d.faqs : []);
          setFaqCategories(Array.isArray(d?.categories) ? d.categories : []);
        }).catch(() => {});
      }

      // 문의 히스토리 (백그라운드, await 안 함)
      if (data.registration?.inquiry || data.registration?.survey_feedback) {
        fetch(`/api/inquiry-comments?registration_id=${data.registration.id}&pin=${encodeURIComponent(lookupPin || pin)}`)
          .then((r) => r.json())
          .then((iqData) => {
            setInquiryComments(iqData.comments || []);
            setInquiryStatus(iqData.inquiry_status || 'pending');
          })
          .catch(() => {});
      }
    } catch {
      setLookupError('네트워크 오류가 발생했습니다.');
    } finally {
      setLookupLoading(false);
    }
  };

  const submitInquiry = async () => {
    if (!newInquiry.trim() || !registration || inquirySubmitting) return;
    setInquirySubmitting(true);
    try {
      const res = await fetch('/api/inquiry-comments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          registration_id: registration.id,
          pin,
          content: newInquiry.trim(),
          author_name: registration.name,
        }),
      });
      if (res.ok) {
        setInquiryComments((prev) => [...prev, {
          id: Date.now().toString(),
          author_type: 'applicant',
          author_name: registration.name,
          content: newInquiry.trim(),
          created_at: new Date().toISOString(),
        }]);
        setInquiryStatus('pending');
        setNewInquiry('');
      }
    } catch { /* ignore */ }
    finally { setInquirySubmitting(false); }
  };

  const handleCancel = async () => {
    if (!registration) return;
    setCancelling(true);
    setCancelError(null);
    trackClick('register-cancel-confirm');
    try {
      const res = await fetch(`/api/register/${registration.id}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        trackClick('register-cancel-fail');
        setCancelError(data.error || `취소 처리에 실패했습니다. (오류 코드: ${res.status}) 잠시 후 다시 시도해 주세요.`);
        return;
      }

      // 취소가 실제로 반영됐는지 검증: 같은 PIN으로 재조회 시 not found여야 정상
      try {
        const verifyRes = await fetch(`/api/register/${registration.id}?pin=${encodeURIComponent(pin)}`);
        if (verifyRes.ok) {
          // 여전히 활성 상태로 조회되면 취소가 반영되지 않은 것
          trackClick('register-cancel-not-reflected');
          setCancelError('취소 요청이 정상 반영되지 않았습니다. 한번 더 "등록 취소" 버튼을 눌러 주세요. 같은 증상이 반복되면 marketing@cloocus.com 으로 알려주세요.');
          return;
        }
      } catch {
        // 검증 호출 자체가 네트워크 오류면 일단 진행 (서버는 200 반환했으므로)
      }

      // 성공 트래킹
      try {
        trackRegistrationCancel(registration.event_name, registration.event_category || '');
        trackClick('register-cancel-success');
      } catch { /* ignore */ }

      setCancelled(true);
      setShowCancelConfirm(false);
    } catch {
      trackClick('register-cancel-network-error');
      setCancelError('네트워크 오류가 발생했습니다. 인터넷 연결을 확인하고 다시 시도해 주세요.');
    } finally {
      setCancelling(false);
    }
  };

  const statusLabel = (status: string) => {
    if (status === 'confirmed') return { text: '등록 확정', bg: 'bg-green-100 text-green-700', icon: '✓' };
    if (status === 'rejected') return { text: '등록 불가', bg: 'bg-red-100 text-red-600', icon: '✕' };
    return { text: '등록 대기', bg: 'bg-yellow-100 text-yellow-700', icon: '⏳' };
  };

  // 세션 복원 중 — 로그인 폼/포탈 어느 쪽도 깜빡이지 않도록 로딩 화면
  if (sessionRestoring) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="flex flex-col items-center gap-3 text-gray-400">
          <div className="w-7 h-7 border-2 border-gray-200 border-t-blue-500 rounded-full animate-spin" />
          <p className="text-sm">불러오는 중...</p>
        </div>
      </div>
    );
  }

  // Login screen
  if (!authenticated) {
    return (
      <div className="min-h-screen flex flex-col">
        <div className="flex-1 flex items-center justify-center p-4">
          <div className="w-full max-w-sm">
            <div className="bg-white rounded-xl border border-gray-200 p-8">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/cloocus-logo.png" alt="Cloocus" className="h-7 mx-auto mb-5" />
              <h1 className="text-xl font-bold text-center mb-1">신청자 포털</h1>
              <p className="text-gray-500 text-center text-sm mb-6">등록 시 입력한 정보로 조회해주세요.</p>

              <div className="space-y-4">
                <div className="field">
                  <label className="text-sm font-medium text-gray-700">등록한 이벤트</label>
                  <select
                    value={lookupEventId}
                    onChange={(e) => { setLookupEventId(e.target.value); setLookupError(''); }}
                  >
                    <option value="">이벤트를 선택해주세요</option>
                    {allEvents.map((evt) => (
                      <option key={evt.id} value={evt.id}>{evt.name}</option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label className="text-sm font-medium text-gray-700">이메일 주소</label>
                  <input
                    type="email"
                    value={lookupEmail}
                    onChange={(e) => { setLookupEmail(e.target.value.toLowerCase()); setLookupError(''); }}
                    placeholder="name@company.com"
                  />
                </div>
                <div className="field">
                  <label className="text-sm font-medium text-gray-700">확인 암호 (숫자 4자리)</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={lookupPin}
                    onChange={(e) => { setLookupPin(e.target.value.replace(/\D/g, '').slice(0, 4)); setLookupError(''); }}
                    placeholder="0000"
                    maxLength={4}
                  />
                </div>
              </div>

              {lookupError && <p className="text-sm text-red-500 mt-3">{lookupError}</p>}

              <button
                onClick={handleLookup}
                disabled={lookupLoading}
                className="btn-primary w-full mt-6"
              >
                {lookupLoading ? '조회 중...' : '조회하기'}
              </button>

              <a href="/" className="block text-center text-sm text-gray-400 hover:text-gray-600 mt-4">
                ← 이벤트 등록하기
              </a>
            </div>
          </div>
        </div>
        <BrandFooter />
      </div>
    );
  }

  // 이벤트 선택 화면 (동일 이메일로 여러 이벤트 신청한 경우)
  if (showEventSelect && !registration) {
    const loadRegistration = async (regId: string) => {
      try {
        const res = await fetch(`/api/register/${regId}?pin=${encodeURIComponent(pin)}`);
        const data = await res.json();
        if (!res.ok) { alert(data.error || '조회에 실패했습니다.'); return; }
        setRegistration(data.registration);
        setCustomQuestions(Array.isArray(data.custom_questions) ? data.custom_questions : []);
        setEditable(data.editable);
        setShowEventSelect(false);
        // 캐시 갱신 — 다음 새로고침 시 즉시 이 이벤트 화면으로 복원
        try { sessionStorage.setItem('cloocus_my_data', JSON.stringify(data)); } catch { /* ignore */ }
        // FAQ는 이미 프리페치됨 → 비어있을 때만 재시도
        if (faqs.length === 0 && faqCategories.length === 0) {
          fetch('/api/faqs').then((r) => r.json()).then((d) => {
            setFaqs(Array.isArray(d?.faqs) ? d.faqs : []);
            setFaqCategories(Array.isArray(d?.categories) ? d.categories : []);
          }).catch(() => {});
        }
      } catch { alert('네트워크 오류가 발생했습니다.'); }
    };

    const statusBadge = (s: string) => {
      if (s === 'confirmed') return { text: '등록 확정', cls: 'bg-green-100 text-green-700' };
      if (s === 'rejected') return { text: '등록 불가', cls: 'bg-red-100 text-red-600' };
      return { text: '등록 대기', cls: 'bg-yellow-100 text-yellow-700' };
    };

    return (
      <div className="min-h-screen flex flex-col">
        <div className="flex-1 flex items-center justify-center p-4">
          <div className="w-full max-w-md">
            <div className="bg-white rounded-xl border border-gray-200 p-8">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/cloocus-logo.png" alt="Cloocus" className="h-7 mx-auto mb-5" />
              <h1 className="text-xl font-bold text-center mb-1">이벤트 선택</h1>
              <p className="text-gray-500 text-center text-sm mb-6">조회할 이벤트를 선택해주세요.</p>

              <div className="space-y-3">
                {multipleEvents.map((evt) => {
                  const badge = statusBadge(evt.registration_status);
                  return (
                    <button
                      key={evt.id}
                      onClick={() => loadRegistration(evt.id)}
                      className="w-full text-left p-4 rounded-lg border-2 border-gray-200 hover:border-blue-400 hover:bg-blue-50 transition-all"
                    >
                      <p className="font-semibold text-base text-gray-900">{evt.event_name}</p>
                      <div className="flex items-center gap-2 mt-1.5">
                        {evt.event_date && (
                          <span className="text-sm text-gray-500">
                            {(() => { const d = new Date(evt.event_date); const day = ['일','월','화','수','목','금','토'][d.getDay()]; return `${d.getFullYear()}년 ${d.getMonth()+1}월 ${d.getDate()}일 (${day})`; })()}
                          </span>
                        )}
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${badge.cls}`}>{badge.text}</span>
                      </div>
                    </button>
                  );
                })}
              </div>

              <button
                onClick={() => { setAuthenticated(false); setShowEventSelect(false); setMultipleEvents([]); try { sessionStorage.removeItem('cloocus_my_session'); sessionStorage.removeItem('cloocus_my_data'); } catch { /* ignore */ } }}
                className="w-full mt-4 text-sm text-gray-400 hover:text-gray-600 hover:underline"
              >
                ← 뒤로가기
              </button>
            </div>
          </div>
        </div>
        <BrandFooter />
      </div>
    );
  }

  // Cancelled screen
  if (cancelled) {
    return (
      <div className="min-h-screen flex flex-col">
        <div className="flex-1 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl border border-gray-200 p-8 max-w-sm w-full text-center">
            <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <span className="text-2xl">✓</span>
            </div>
            <h2 className="text-xl font-bold mb-2">등록이 취소되었습니다</h2>
            <p className="text-gray-500 text-sm mb-6">이벤트 등록이 정상적으로 취소되었습니다.</p>
            <a href="/" className="btn-primary inline-block">돌아가기</a>
          </div>
        </div>
        <BrandFooter />
      </div>
    );
  }

  if (isAccessExpired) {
    return (
      <div className="min-h-screen flex flex-col">
        <div className="flex-1 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl border border-gray-200 p-8 max-w-sm w-full text-center">
            <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <span className="text-2xl">🔒</span>
            </div>
            <h2 className="text-xl font-bold mb-2">조회 기간이 만료되었습니다</h2>
            <p className="text-gray-500 text-sm mb-2">이벤트 종료 후 7일이 경과하여</p>
            <p className="text-gray-500 text-sm mb-6">신청 내역을 조회할 수 없습니다.</p>
            <p className="text-xs text-gray-400 mb-4">문의: marketing@cloocus.com</p>
            <a href="/" className="btn-primary inline-block">돌아가기</a>
          </div>
        </div>
        <BrandFooter />
      </div>
    );
  }

  if (!registration) return null;

  const status = statusLabel(registration.registration_status || 'pending');

  return (
    <div className="min-h-screen flex flex-col">
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-4xl mx-auto px-4 py-5">
          <div className="flex items-center justify-between">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/cloocus-logo.png" alt="Cloocus" className="h-5" />
            <button
              onClick={() => { setAuthenticated(false); setRegistration(null); setLookupEmail(''); setLookupPin(''); try { sessionStorage.removeItem('cloocus_my_session'); sessionStorage.removeItem('cloocus_my_data'); } catch { /* ignore */ } }}
              className="text-sm text-gray-400 hover:text-gray-600"
            >
              로그아웃
            </button>
          </div>
          <h1 className="text-xl font-bold text-gray-900 mt-2">신청자 포털</h1>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-6 flex-1 w-full bg-white">
        {isEventEnded && daysRemaining !== null && daysRemaining > 0 && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-4 text-center">
            <p className="text-sm text-amber-700 font-medium">이벤트가 종료되었습니다. 조회 가능 기간이 <strong>{daysRemaining}일</strong> 남았습니다.</p>
            <p className="text-xs text-amber-500 mt-1">종료일 기준 7일 이후에는 신청 내역을 조회할 수 없습니다.</p>
          </div>
        )}

        {/* 이벤트 정보 */}
        <div className="bg-white rounded-xl border border-gray-200 p-5 mb-4" style={{ backgroundColor: '#e0f2fe' }}>
          <div className="flex items-center gap-2 mb-1">
            {registration.event_category && (
              <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-blue-100 text-blue-700">
                {registration.event_category}
              </span>
            )}
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
              registration.event_type === 'online' ? 'bg-green-100 text-green-700' : 'bg-purple-100 text-purple-700'
            }`}>
              {registration.event_type === 'online' ? 'Online' : 'Offline'}
            </span>
            {registration.event_category === '프로모션' && registration.event_promo_url && (
              <a
                href={registration.event_promo_url}
                target="_blank"
                rel="noreferrer"
                onClick={() => trackClick('promo-detail-link', { event_id: registration.event_id })}
                className="ml-auto inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1 rounded-full bg-white border border-blue-200 text-blue-700 hover:border-blue-400 hover:shadow-sm transition"
              >
                프로모션 상세보기
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.2" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M14 3h7v7M21 3l-9 9M5 5h6v2H7v10h10v-4h2v6H5z" />
                </svg>
              </a>
            )}
          </div>
          <p className="text-lg font-bold text-gray-900 mt-1">{registration.event_name}</p>
          <div className="flex flex-wrap gap-3 mt-2 text-sm text-gray-600">
            {registration.event_date && (
              <span>{(() => { const d = new Date(registration.event_date); const day = ['일','월','화','수','목','금','토'][d.getDay()]; return `${d.getFullYear()}년 ${d.getMonth()+1}월 ${d.getDate()}일 (${day})`; })()}</span>
            )}
            {registration.event_time && <span>{registration.event_time}</span>}
            {registration.event_location && <span>{registration.event_location}</span>}
          </div>
        </div>

        {/* 등록 상태 (확정 시 QR 영역에서 표시하므로 제외) */}
        {showStatus && registration.registration_status !== 'confirmed' && (
          <div className={`bg-white rounded-xl border p-5 mb-4 ${registration.registration_status === 'rejected' ? 'border-red-200' : 'border-gray-200'}`}>
            {registration.registration_status === 'pending' && (
              <div className={`w-full text-center py-3 rounded-lg font-bold text-base ${status.bg}`}>
                {status.icon} {status.text}
              </div>
            )}
            {registration.registration_status === 'rejected' && (
              <div className="w-full text-center py-3 rounded-lg font-bold text-base bg-red-100 text-red-600">
                귀하의 본 이벤트 등록이 어려운 점 안내드립니다.
              </div>
            )}
            {registration.registration_status === 'pending' && (
              <p className="text-xs text-gray-400 mt-3 text-center">관리자가 등록 상태를 확정하면 업데이트됩니다.</p>
            )}
            {registration.registration_status === 'rejected' && (
              <div className="mt-4 p-4 bg-gray-50 rounded-lg text-sm text-gray-600 leading-relaxed whitespace-pre-wrap">
{`안녕하세요, 클루커스입니다.
클루커스 이벤트에 관심 가지고 신청해 주셔서 진심으로 감사드립니다.

준비된 환경 범위 내에서 참석 인원이 마감됨에 따라
귀하의 본 이벤트 등록이 어려운 점 너른 양해 부탁드립니다.

금번 이벤트에는 함께 모시지 못하지만,
궁금하신 사항이나 기술 도입과 관련해 논의가 필요하시면 언제든지 편히 문의해 주세요.

귀사의 비즈니스 환경에 최적화된 방향으로 상세히 안내 드리겠습니다.

감사합니다.
클루커스 드림`}
              </div>
            )}
          </div>
        )}

        {/* 등록 확정 영역 */}
        {registration.registration_status === 'confirmed' && (
          <>
            {/* 설문조사 미완료 + 설문 활성화 → 선택 화면 또는 설문 버튼 */}
            {registration.survey_enabled && !registration.survey_completed && !surveySubmitted && !showSurvey && !showSurveyChoice && !surveyWithEdit && (
              <div className="bg-white rounded-xl border-2 border-green-200 p-6 mb-4 text-center">
                <p className="text-gray-900 font-semibold text-base mb-1">오늘의 경험을 설문조사에 남겨 주세요.</p>
                <p className="text-green-600 text-sm mb-5">설문조사 완료 후 수료증 발급이 가능합니다.</p>
                <button onClick={() => setShowSurveyChoice(true)} className="btn-shimmer">
                  설문조사 작성하기
                </button>
              </div>
            )}

            {/* 설문 진입 선택: 저장된 정보 불러오기 / 새로 작성하기 */}
            {showSurveyChoice && !showSurvey && !surveyWithEdit && (
              <div className="bg-white rounded-xl border border-gray-200 p-6 mb-4 text-center">
                <h2 className="text-lg font-bold mb-2">설문조사 시작</h2>
                <p className="text-sm text-gray-500 mb-6">기존에 등록하신 정보로 진행하시겠습니까?</p>
                <div className="flex gap-3">
                  <button
                    onClick={() => { setShowSurveyChoice(false); setShowSurvey(true); }}
                    className="btn-primary flex-1" style={{ padding: '12px 0', fontSize: 14 }}
                  >
                    저장된 등록 정보로 시작하기
                  </button>
                  <button
                    onClick={() => { setShowSurveyChoice(false); startEdit(); setSurveyWithEdit(true); }}
                    className="btn-secondary flex-1" style={{ padding: '12px 0', fontSize: 14 }}
                  >
                    새로 입력 후 시작하기
                  </button>
                </div>
                <button onClick={() => setShowSurveyChoice(false)} className="text-sm text-gray-400 hover:text-gray-600 mt-3">
                  취소
                </button>
              </div>
            )}

            {/* 설문조사 폼 */}
            {showSurvey && !surveySubmitted && (
              <div className="bg-white rounded-xl border border-gray-200 p-6 mb-4">
                <button onClick={() => { setShowSurvey(false); }} className="text-sm text-gray-400 hover:text-gray-600 mb-3 flex items-center gap-1">
                  <span>←</span> 뒤로가기
                </button>
                <div className="flex items-center justify-between mb-1">
                  <h2 className="text-lg font-bold">설문조사</h2>
                </div>
                <div className="flex items-center justify-between mb-6">
                  <p className="text-sm text-gray-500">오늘의 경험에 대해 알려주세요.</p>
                  <span className="text-xs text-red-500 shrink-0">* 필수</span>
                </div>

                <div className="space-y-6">
                  {surveyQuestions.map((q, idx) => (
                    <SurveyQuestionField
                      key={q.id}
                      q={q}
                      index={idx}
                      answer={surveyAnswers[q.id]}
                      etc={surveyEtc[q.id] || ''}
                      error={surveyErrors[q.id]}
                      etcError={surveyErrors[`${q.id}_etc`]}
                      onSingleChange={(v) => setSingleAnswer(q.id, v)}
                      onMultiToggle={(opt) => toggleMultiAnswer(q.id, opt)}
                      onTextChange={(v) => setTextAnswer(q.id, v)}
                      onEtcChange={(v) => setEtcAnswer(q.id, v)}
                    />
                  ))}
                </div>

                <button
                  onClick={async () => {
                    const { errors, messages } = validateSurvey();
                    setSurveyErrors(errors);
                    if (messages.length > 0) {
                      setSurveyValidationPopup(messages);
                      return;
                    }

                    setSurveySubmitting(true);
                    try {
                      const answers = buildSurveyAnswers();
                      const res = await fetch('/api/survey', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                          registration_id: registration.id,
                          pin,
                          answers,
                        }),
                      });
                      const data = await res.json();
                      if (!res.ok) { alert(data.error || '제출에 실패했습니다.'); return; }
                      setSurveySubmitted(true);
                      setShowSurvey(false);
                      if (registration) {
                        setRegistration({ ...registration, survey_completed: true });
                        trackSurveyComplete(registration.event_name, registration.event_category || '');
                      }
                    } catch { alert('네트워크 오류가 발생했습니다.'); }
                    finally { setSurveySubmitting(false); }
                  }}
                  disabled={surveySubmitting}
                  className="btn-primary w-full mt-6"
                >
                  {surveySubmitting ? '제출 중...' : '제출하기'}
                </button>
              </div>
            )}

            {/* 설문 검증 오류 팝업 */}
            {surveyValidationPopup.length > 0 && (
              <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: 'rgba(0,0,0,0.4)' }}>
                <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6">
                  <div className="flex items-center gap-2 mb-4">
                    <span className="text-red-500 text-xl">⚠</span>
                    <h3 className="text-lg font-bold text-gray-900">입력 정보를 확인해주세요</h3>
                  </div>
                  <ul className="space-y-2 mb-6 max-h-60 overflow-y-auto">
                    {surveyValidationPopup.map((msg, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm text-gray-700">
                        <span className="text-red-400 mt-0.5 shrink-0">•</span>
                        {msg}
                      </li>
                    ))}
                  </ul>
                  <button onClick={() => setSurveyValidationPopup([])} className="btn-primary w-full">확인</button>
                </div>
              </div>
            )}

            {/* 설문 완료 화면 */}
            {(surveySubmitted || (registration.survey_enabled && registration.survey_completed)) && !showSurvey && !showSurveyChoice && (
              <div className="bg-white rounded-xl border-2 border-green-200 p-6 mb-4 text-center">
                <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <svg className="w-8 h-8 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <p className="text-xl font-bold text-gray-900 mb-2">설문조사 제출이 완료되었습니다!</p>
                <p className="text-sm text-gray-500 mb-4">오늘의 경험을 공유해 주셔서 감사합니다.</p>

                {/* 수료증 다운로드 */}
                <button
                  onClick={async () => {
                    // 일시적 외부 의존성·청크 로드 실패를 흡수하기 위해 1회 자동 재시도.
                    // 로고·직인을 fetch → dataURL 로 변환. html2canvas 가 외부 이미지 로드·디코드 타이밍에
                    // 휘둘리지 않도록 모든 그림을 인라인으로 박는다. (production 에서 `createPattern` 0×0 canvas 에러 차단)
                    const urlToDataUrl = async (url: string): Promise<string> => {
                      const res = await fetch(url, { cache: 'force-cache' });
                      if (!res.ok) throw new Error(`이미지 로드 실패: ${url} (${res.status})`);
                      const blob = await res.blob();
                      return await new Promise<string>((resolve, reject) => {
                        const reader = new FileReader();
                        reader.onloadend = () => resolve(reader.result as string);
                        reader.onerror = () => reject(new Error(`이미지 변환 실패: ${url}`));
                        reader.readAsDataURL(blob);
                      });
                    };

                    const generateAndSave = async () => {
                      // qrcode 는 ESM module 필드가 없는 순수 CJS — 번들러/런타임에 따라 .default 가 undefined 인 케이스 방어.
                      const [html2canvas, { jsPDF }, qrMod, logoDataUrl, stampDataUrl] = await Promise.all([
                        import('html2canvas').then((m) => m.default),
                        import('jspdf'),
                        import('qrcode'),
                        urlToDataUrl('/cloocus-logo.png'),
                        urlToDataUrl('/stamp.png'),
                      ]);
                      const QRCode = (qrMod as unknown as { default?: typeof qrMod }).default ?? qrMod;

                      const issueDate = new Date();
                      const evtDate = new Date(registration.event_date);
                      const issueDateStr = `${issueDate.getFullYear()}. ${String(issueDate.getMonth()+1).padStart(2,'0')}. ${String(issueDate.getDate()).padStart(2,'0')}`;
                      const periodStr = `${evtDate.getFullYear()}. ${String(evtDate.getMonth()+1).padStart(2,'0')}. ${String(evtDate.getDate()).padStart(2,'0')}`;

                      // 위조 방지: 고유 인증번호 생성
                      const certId = `CLO-${registration.id.slice(0,8).toUpperCase()}-${Date.now().toString(36).toUpperCase()}`;
                      const verifyQr = `${window.location.origin}/verify/${registration.id}`;

                      // QR 코드를 dataURL 로 사전 생성 (외부 서비스 의존 제거 — 일시 장애·CORS 이슈 차단)
                      const qrDataUrl = await QRCode.toDataURL(verifyQr, {
                        width: 200,
                        margin: 0,
                        errorCorrectionLevel: 'M',
                      });

                      const certEl = document.createElement('div');
                      certEl.style.cssText = 'position:fixed;left:-9999px;top:0;width:1122px;height:794px;font-family:"Noto Sans KR",sans-serif;overflow:hidden;';
                      certEl.innerHTML = `
                        <div style="display:flex;width:100%;height:100%;background:#fff;">
                          <!-- 좌측 60% -->
                          <div style="width:60%;height:100%;padding:48px 50px 38px;display:flex;flex-direction:column;justify-content:space-between;box-sizing:border-box;">
                            <!-- 좌측 상단: 로고 (dataURL 인라인 · 명시 높이로 0×0 회피) -->
                            <img src="${logoDataUrl}" style="width:120px;height:45px;object-fit:contain;" />

                            <!-- 좌측 중심: CERTIFICATE OF COMPLETION -->
                            <div>
                              <p style="font-size:64px;font-weight:800;color:#1a1a1a;letter-spacing:5px;margin:0 0 28px;line-height:1;">CERTIFICATE</p>
                              <p style="font-size:22px;font-weight:500;color:#999;margin:0 0 0 3px;letter-spacing:4px;">OF COMPLETION</p>
                              <div style="width:80px;height:3px;background:#4c2d96;margin-top:20px;border-radius:2px;"></div>
                            </div>

                            <!-- 좌측 하단: CEO + Issued on + Issued by + QR (1열, 동일 레벨) -->
                            <div style="display:flex;gap:30px;align-items:flex-start;">
                              <!-- CEO + 직인 (텍스트 위에 겹침) -->
                              <div>
                                <p style="font-size:10px;color:#4c2d96;margin:0 0 4px;font-weight:600;letter-spacing:1px;">Cloocus CEO</p>
                                <div style="position:relative;display:inline-block;margin:0 0 4px;">
                                  <p style="font-size:14px;font-weight:700;color:#222;margin:0;position:relative;z-index:1;">Steve Hong</p>
                                  <img src="${stampDataUrl}" style="position:absolute;top:50%;right:-14px;transform:translateY(-50%);width:56px;height:56px;opacity:0.62;mix-blend-mode:multiply;pointer-events:none;z-index:2;" />
                                </div>
                              </div>
                              <!-- Issued on -->
                              <div>
                                <p style="font-size:10px;color:#4c2d96;margin:0 0 4px;font-weight:600;letter-spacing:1px;">Issued on</p>
                                <p style="font-size:14px;font-weight:700;color:#222;margin:0;">${issueDateStr}</p>
                              </div>
                              <!-- Issued by -->
                              <div>
                                <p style="font-size:10px;color:#4c2d96;margin:0 0 4px;font-weight:600;letter-spacing:1px;">Issued by</p>
                                <p style="font-size:14px;font-weight:700;color:#222;margin:0;">Cloocus co.,Ltd.</p>
                              </div>
                              <!-- 위조방지 QR + 인증번호 (QR 은 dataURL 로 인라인 — 외부 서비스 의존 없음) -->
                              <div style="display:flex;align-items:flex-start;gap:10px;margin-left:auto;">
                                <img src="${qrDataUrl}" style="width:52px;height:52px;" />
                                <div style="padding-top:2px;">
                                  <p style="font-size:9px;color:#999;margin:0 0 2px;font-weight:600;">Certificate ID</p>
                                  <p style="font-size:10px;color:#666;margin:0;font-family:monospace;letter-spacing:0.5px;">${certId}</p>
                                </div>
                              </div>
                            </div>
                          </div>

                          <!-- 구분선 -->
                          <div style="width:1px;background:linear-gradient(180deg,transparent 5%,#e0dce8 20%,#e0dce8 80%,transparent 95%);"></div>

                          <!-- 우측 40% -->
                          <div style="width:40%;height:100%;background:linear-gradient(160deg,#5b35a8 0%,#3a1d80 40%,#1a1045 100%);padding:35px 32px;display:flex;flex-direction:column;box-sizing:border-box;position:relative;">
                            <!-- 인증 마크 -->
                            <div style="width:150px;height:150px;border-radius:50%;border:3px solid rgba(255,255,255,0.2);display:flex;flex-direction:column;align-items:center;justify-content:center;position:absolute;top:20px;right:20px;background:radial-gradient(circle,rgba(100,70,200,0.35) 0%,transparent 70%);">
                              <div style="width:125px;height:125px;border-radius:50%;border:2px solid rgba(255,255,255,0.35);display:flex;flex-direction:column;align-items:center;justify-content:center;">
                                <div style="width:100px;height:100px;border-radius:50%;border:1.5px solid rgba(255,255,255,0.25);display:flex;flex-direction:column;align-items:center;justify-content:center;">
                                  <p style="font-size:16px;font-weight:800;color:#fff;margin:0;letter-spacing:2px;">VERIFIED</p>
                                  <div style="width:45px;height:1.5px;background:rgba(255,255,255,0.5);margin:5px 0;"></div>
                                  <p style="font-size:9px;font-weight:600;color:rgba(255,255,255,0.75);margin:0;letter-spacing:2.5px;">OFFICIAL</p>
                                </div>
                              </div>
                            </div>

                            <!-- 수료자 정보 -->
                            <div style="margin-top:160px;">
                              <p style="font-size:10px;color:rgba(180,170,220,0.8);margin:0 0 6px;letter-spacing:2px;text-transform:uppercase;">Name</p>
                              <p style="font-size:24px;font-weight:700;color:#fff;margin:0 0 22px;border-bottom:1px solid rgba(255,255,255,0.15);padding-bottom:12px;">${registration.name}</p>

                              <p style="font-size:10px;color:rgba(180,170,220,0.8);margin:0 0 6px;letter-spacing:2px;text-transform:uppercase;">Course Name</p>
                              <p style="font-size:15px;font-weight:600;color:#fff;margin:0 0 22px;line-height:1.5;word-break:keep-all;">${registration.event_name}</p>

                              <p style="font-size:10px;color:rgba(180,170,220,0.8);margin:0 0 6px;letter-spacing:2px;text-transform:uppercase;">Period</p>
                              <p style="font-size:15px;font-weight:600;color:#fff;margin:0 0 28px;">${periodStr}</p>

                              <!-- 인증 문구 (PERIOD 바로 아래) -->
                              <p style="font-size:16px;font-weight:600;color:#fff;margin:0;line-height:2;word-break:keep-all;">위 사람은 클루커스의 &ldquo;${registration.event_name}&rdquo;에</p>
                              <p style="font-size:16px;font-weight:600;color:#fff;margin:0;line-height:2;">참석하시어 성실히 이수하였기에 이 증서를 수여합니다.</p>
                            </div>
                          </div>
                        </div>
                      `;
                      document.body.appendChild(certEl);

                      try {
                        // 이미지 디코드 완료 대기 — complete 체크만으로는 naturalWidth 0 인 상태도 통과하므로
                        // decode() 로 실제 디코드까지 보장한다. (html2canvas createPattern 0×0 에러 차단)
                        const imgs = Array.from(certEl.querySelectorAll('img'));
                        await Promise.all(imgs.map(async (img) => {
                          try { await img.decode(); } catch {
                            // decode 실패 시 onload 폴백
                            if (!img.complete) {
                              await new Promise<void>((r) => { img.onload = () => r(); img.onerror = () => r(); setTimeout(r, 1500); });
                            }
                          }
                        }));

                        const canvas = await html2canvas(certEl, { scale: 2, backgroundColor: '#fff', useCORS: true, logging: false });
                        const imgData = canvas.toDataURL('image/png');
                        const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
                        doc.addImage(imgData, 'PNG', 0, 0, 297, 210);

                        // PDF 메타데이터 (위조 방지)
                        doc.setProperties({
                          title: `수료증 - ${registration.name}`,
                          subject: registration.event_name,
                          author: 'Cloocus co.,ltd.',
                          creator: `Cloocus Event System | ${certId}`,
                        });

                        doc.save(`수료증_${registration.name}_${registration.event_name}.pdf`);
                      } finally {
                        if (certEl.parentNode) certEl.parentNode.removeChild(certEl);
                      }

                      // GA: 수료증 다운로드
                      trackCertificateDownload(registration.event_name, registration.event_category || '');

                      // 발급 기록
                      fetch('/api/certificate', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ registration_id: registration.id, pin }),
                      }).catch(() => {});
                    };

                    try {
                      await generateAndSave();
                    } catch (err1) {
                      // 일시 오류(예: 청크 로드 실패) — 0.5s 후 1회 재시도
                      console.error('[my] 수료증 1차 시도 실패 — 재시도합니다:', err1);
                      await new Promise((r) => setTimeout(r, 500));
                      try {
                        await generateAndSave();
                      } catch (err2) {
                        const e = err2 as { name?: string; message?: string };
                        const errName = e?.name || 'UnknownError';
                        const errMsg = (e?.message || '').slice(0, 140);
                        console.error('[my] 수료증 재시도도 실패:', err2);
                        trackCertificateDownloadFailed(registration.event_name, registration.event_category || '', errName);
                        alert(`수료증 발급에 실패했습니다.\n잠시 후 다시 시도해 주시거나, 페이지를 새로고침해 주세요.\n계속 같은 문제가 발생하면 marketing@cloocus.com 으로 알려주세요.\n\n오류: ${errName}${errMsg ? ` — ${errMsg}` : ''}`);
                      }
                    }
                  }}
                  className="btn-primary mb-3"
                >
                  수료증 발급하기 (PDF)
                </button>
                <p className="text-xs text-red-500 mt-2">수료증 발급은 이벤트 종료일 기준 7일 이후에는 발급이 불가합니다.</p>

                {canEditSurvey && (
                <div className="text-right mt-3">
                  <button
                    onClick={async () => {
                      // 기존 응답 불러오기 (answers JSONB 우선, 없으면 legacy q1~q6)
                      try {
                        const res = await fetch(`/api/survey?registration_id=${registration.id}&pin=${encodeURIComponent(pin)}`);
                        const data = await res.json();
                        if (data.exists && data.survey) {
                          hydrateSurveyFromRecord(data.survey);
                        }
                      } catch { /* 불러오기 실패 시 빈 폼 */ }
                      setSurveySubmitted(false);
                      setShowSurvey(true);
                      setSurveyErrors({});
                    }}
                    className="text-sm text-blue-600 hover:underline"
                  >
                    설문조사 수정하기
                  </button>
                </div>
                )}
              </div>
            )}

            {/* 설문 미활성화 상태 (기존 확정 화면) */}
            {!registration.survey_enabled && !surveySubmitted && (
              <div className="bg-white rounded-xl border-2 border-green-200 p-6 mb-4 text-center">
                <div className="bg-green-50 rounded-lg p-3 mb-4">
                  <p className="text-green-700 font-bold text-lg">등록이 확정되었습니다</p>
                  <p className="text-green-600 text-sm mt-1">{registration.event_name}</p>
                </div>
                {showQr && (
                  <>
                    <p className="text-xs text-gray-500 mb-3">이벤트 현장에서 아래 QR코드를 제시해주세요.</p>
                    {verifyQrDataUrl ? (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img
                        src={verifyQrDataUrl}
                        alt="QR Code"
                        className="mx-auto border border-gray-100 rounded-lg p-2"
                        width={200}
                        height={200}
                      />
                    ) : (
                      <div
                        className="mx-auto border border-gray-100 rounded-lg p-2 bg-gray-50 flex items-center justify-center text-xs text-gray-400"
                        style={{ width: 200, height: 200 }}
                      >
                        QR 생성 중…
                      </div>
                    )}
                    <p className="text-xs text-gray-400 mt-3">{registration.name} | {registration.company_name}</p>
                    <p className="text-[10px] text-gray-300 mt-1">QR 스캔 시 참석자 검증 페이지로 연결됩니다</p>
                  </>
                )}
              </div>
            )}
          </>
        )}

        {/* 문의사항 대화형 UI */}
        {(registration.inquiry || registration.survey_feedback) && (
          <div className="bg-white rounded-xl border border-gray-200 p-5 mb-4">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-medium text-gray-500 flex items-center gap-2">
                💬 문의사항
                {inquiryStatus === 'answered' && inquiryComments.some((c) => c.author_type === 'admin') && (
                  <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse" title="새 답변" />
                )}
              </h2>
              <span className={`text-xs px-2.5 py-0.5 rounded-full font-medium whitespace-nowrap ${
                inquiryStatus === 'answered' ? 'bg-green-100 text-green-700' :
                inquiryStatus === 'dismissed' ? 'bg-gray-100 text-gray-500' :
                'bg-yellow-100 text-yellow-700'
              }`}>
                {inquiryStatus === 'answered' ? '답변 완료' : inquiryStatus === 'dismissed' ? '관리자 응답 불필요' : '답변 대기'}
              </span>
            </div>

            {/* 대화 히스토리 */}
            <div className="space-y-3 mb-4">
              {/* 최초 문의 (등록 시 작성) */}
              {registration.inquiry && (
                <div className="flex justify-end">
                  <div className="max-w-[80%]">
                    <div className="bg-blue-50 rounded-xl rounded-tr-sm px-4 py-3">
                      <p className="text-sm text-gray-800 whitespace-pre-wrap">{registration.inquiry}</p>
                    </div>
                    <p className="text-xs text-gray-400 text-right mt-1">
                      {registration.name} · {new Date(registration.created_at || '').toLocaleDateString('ko-KR')}
                    </p>
                  </div>
                </div>
              )}

              {/* 설문 피드백 (q6) — 채팅 메시지 형태로 이어서 표시 */}
              {registration.survey_feedback && (
                <div className="flex justify-end">
                  <div className="max-w-[80%]">
                    <div className="bg-blue-50 rounded-xl rounded-tr-sm px-4 py-3">
                      <p className="text-sm text-gray-800 whitespace-pre-wrap">{registration.survey_feedback}</p>
                    </div>
                    <p className="text-xs text-gray-400 text-right mt-1">
                      {registration.name} · 설문 피드백
                    </p>
                  </div>
                </div>
              )}

              {/* 코멘트 히스토리 */}
              {inquiryComments.map((comment) => (
                <div key={comment.id} className={`flex ${comment.author_type === 'applicant' ? 'justify-end' : 'justify-start'}`}>
                  <div className="max-w-[80%]">
                    {comment.author_type === 'admin' ? (
                      <div className="bg-white border border-gray-200 rounded-xl rounded-tl-sm px-4 py-3">
                        <div className="flex items-center gap-1.5 mb-1">
                          <span className="w-5 h-5 bg-blue-600 rounded-full flex items-center justify-center text-white text-[10px] font-bold">C</span>
                          <span className="text-xs font-medium text-blue-700">{comment.author_name}</span>
                        </div>
                        <p className="text-sm text-gray-800 whitespace-pre-wrap">{comment.content}</p>
                      </div>
                    ) : (
                      <div className="bg-blue-50 rounded-xl rounded-tr-sm px-4 py-3">
                        <p className="text-sm text-gray-800 whitespace-pre-wrap">{comment.content}</p>
                      </div>
                    )}
                    <p className={`text-xs text-gray-400 mt-1 ${comment.author_type === 'applicant' ? 'text-right' : 'text-left'}`}>
                      {new Date(comment.created_at).toLocaleDateString('ko-KR')} {new Date(comment.created_at).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                </div>
              ))}

              {/* 답변 대기 안내 */}
              {inquiryStatus === 'pending' && !inquiryComments.some((c) => c.author_type === 'admin') && (
                <div className="text-center py-2">
                  <p className="text-xs text-gray-400">관리자가 문의를 확인 중입니다.</p>
                </div>
              )}
            </div>

            {/* 추가 문의 안내 */}
            <div className="text-center pt-2 border-t border-gray-100">
              <p className="text-xs text-gray-400">추가 문의는 자주 묻는 질문(FAQ)을 먼저 확인해주세요.</p>
            </div>
          </div>
        )}

        {/* 신청 내역 + FAQ 2컬럼 */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
          {/* 좌측: 신청 내역 */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h2 className="text-sm font-medium text-gray-500 mb-3">신청 내역</h2>
            <div className="space-y-3">
              {[
                ['성함', registration.name],
                ['회사명', registration.company_name],
                ['부서명', registration.department],
                ['직급', registration.job_title],
                ['이메일', registration.email],
                ['연락처', registration.phone],
                ['산업군', registration.industry],
                ['기업 규모', registration.company_size],
                ['신청 경로', registration.referral_source],
                ...(registration.referrer_name ? [['추천인', registration.referrer_name]] : []),
                ...(registration.inquiry ? [['문의사항', registration.inquiry]] : []),
              ].map(([label, value]) => (
                <div key={label} className="flex items-start gap-3">
                  <span className="text-sm text-gray-400 w-20 shrink-0">{label}</span>
                  <span className="text-sm text-gray-900">{value}</span>
                </div>
              ))}
            </div>

            {/* 이벤트 전용 추가 문항 응답 */}
            {customQuestions.length > 0 && (
              <div className="mt-5 pt-4 border-t border-gray-100">
                <h3 className="text-xs font-semibold text-amber-700 mb-3 uppercase tracking-wide">✨ 추가 문항 응답</h3>
                <div className="space-y-3">
                  {customQuestions.map((q) => {
                    const a = (registration.custom_answers || {})[q.id];
                    let display: string;
                    if (Array.isArray(a)) display = a.length > 0 ? a.join(', ') : '(응답 없음)';
                    else if (typeof a === 'boolean') display = a ? '동의함' : '미동의';
                    else if (typeof a === 'string') display = a || '(응답 없음)';
                    else display = '(응답 없음)';
                    return (
                      <div key={q.id} className="border-l-2 border-amber-200 pl-3">
                        <p className="text-xs text-gray-500 mb-0.5">{q.label}</p>
                        <p className="text-sm text-gray-900 whitespace-pre-wrap">{display}</p>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* 우측: FAQ */}
          {faqs.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <h2 className="text-sm font-medium text-gray-500 mb-3">자주 묻는 질문 (FAQ)</h2>

              {/* 검색 */}
              <div className="relative mb-4">
                <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                <input
                  type="text"
                  value={faqSearch}
                  onChange={(e) => setFaqSearch(e.target.value)}
                  placeholder="질문을 검색해보세요..."
                  className="w-full pl-9 pr-3 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-300"
                />
                {faqSearch && (
                  <button onClick={() => setFaqSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-xs">
                    ✕
                  </button>
                )}
              </div>

              {/* 카테고리별 FAQ */}
              <div className="space-y-3 max-h-[500px] overflow-y-auto">
                {(() => {
                  const search = faqSearch.trim().toLowerCase();
                  const filtered = search
                    ? faqs.filter((f) => f.question.toLowerCase().includes(search) || f.answer.toLowerCase().includes(search))
                    : faqs;

                  if (filtered.length === 0) {
                    return (
                      <div className="text-center py-8">
                        <p className="text-sm text-gray-400">검색 결과가 없습니다.</p>
                      </div>
                    );
                  }

                  // 카테고리별 그룹핑
                  const grouped: { category: FAQCategory | null; items: FAQItem[] }[] = [];

                  if (faqCategories.length > 0) {
                    for (const cat of faqCategories) {
                      const items = filtered.filter((f) => f.category_id === cat.id);
                      if (items.length > 0) grouped.push({ category: cat, items });
                    }
                    // 카테고리 없는 FAQ (null/undefined 또는 존재하지 않는 카테고리)
                    const catIds = new Set(faqCategories.map((c) => c.id));
                    const uncategorized = filtered.filter((f) => !f.category_id || !catIds.has(f.category_id));
                    if (uncategorized.length > 0) grouped.push({ category: null, items: uncategorized });
                  } else {
                    // 카테고리 없으면 플랫 리스트
                    grouped.push({ category: null, items: filtered });
                  }

                  const highlightText = (text: string) => {
                    if (!search) return text;
                    const idx = text.toLowerCase().indexOf(search);
                    if (idx === -1) return text;
                    return (
                      <>
                        {text.slice(0, idx)}
                        <mark className="bg-yellow-100 rounded px-0.5">{text.slice(idx, idx + search.length)}</mark>
                        {text.slice(idx + search.length)}
                      </>
                    );
                  };

                  return grouped.map((group, gi) => (
                    <div key={gi}>
                      {group.category && (
                        <button
                          onClick={() => setOpenCategoryId(openCategoryId === group.category!.id ? null : group.category!.id)}
                          className="w-full flex items-center justify-between py-2 px-1 text-left"
                        >
                          <div className="flex items-center gap-2">
                            <span className="text-sm">{group.category.icon || '📌'}</span>
                            <span className="text-sm font-semibold text-gray-700">{group.category.name}</span>
                            <span className="text-xs text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded-full">{group.items.length}</span>
                          </div>
                          <span className="text-gray-400 text-xs">{(search || openCategoryId === group.category.id) ? '▲' : '▼'}</span>
                        </button>
                      )}

                      {(search || !group.category || openCategoryId === group.category.id) && (
                        <div className="bg-gray-50 rounded-lg overflow-hidden">
                          {group.items.map((faq, i) => (
                            <div key={faq.id} className={i > 0 ? 'border-t border-gray-200' : ''}>
                              <button
                                onClick={() => {
                                  const isOpening = openFaqId !== faq.id;
                                  setOpenFaqId(isOpening ? faq.id : null);
                                  // 여는 시점에만 트래킹 — 닫기는 무시
                                  if (isOpening) trackClick(`faq:${faq.id}`);
                                }}
                                className="w-full text-left px-4 py-3 flex items-start justify-between hover:bg-gray-100 transition-colors"
                              >
                                <span className="text-sm font-medium text-gray-800 pr-3"><span className="text-blue-600 font-bold">Q.</span> {highlightText(faq.question)}</span>
                                <span className="text-gray-400 shrink-0 text-xs mt-0.5">{openFaqId === faq.id ? '−' : '+'}</span>
                              </button>
                              {openFaqId === faq.id && (
                                <div className="px-4 pb-3">
                                  <div className="bg-white rounded-lg p-3 text-sm text-gray-600 leading-relaxed border border-gray-100 faq-answer" dangerouslySetInnerHTML={{ __html: search ? faq.answer.replace(new RegExp(`(${search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi'), '<mark class="bg-yellow-100 rounded px-0.5">$1</mark>') : faq.answer }} />
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ));
                })()}
              </div>

              {/* 하단 문의 링크 */}
              <div className="mt-4 pt-3 border-t border-gray-100 text-center">
                <p className="text-xs text-gray-400">
                  원하시는 답변을 찾지 못하셨나요? 📧 <a href="mailto:marketing@cloocus.com" className="text-blue-500 hover:underline">marketing@cloocus.com</a>
                </p>
              </div>
            </div>
          )}
        </div>

        {/* 문의 이메일 (등록 불가 시) */}
        {registration.registration_status === 'rejected' && showStatus && (
          <div className="mb-4 text-center py-3">
            <p className="text-sm text-gray-500">문의사항 | 📧 <a href="mailto:marketing@cloocus.com" className="text-blue-600 hover:underline">marketing@cloocus.com</a></p>
          </div>
        )}

        {/* 수정 폼 */}
        {editMode && (
          <div className="bg-white rounded-xl border border-gray-200 p-5 mb-4">
            <h2 className="text-lg font-semibold border-b pb-3 mb-4">신청 내역 수정</h2>
            {editServerError && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">{editServerError}</div>
            )}
            <div className="space-y-4">
              {[
                ['name', '성함', 'text'],
                ['company_name', '회사명', 'text'],
                ['department', '부서명', 'text'],
                ['job_title', '직급', 'text'],
                ['email', '이메일', 'email'],
              ].map(([key, label, type]) => (
                <div key={key} className="field">
                  <label className="text-sm font-medium text-gray-700">{label} <span className="text-red-500">*</span></label>
                  <input
                    type={type}
                    value={editForm[key] || ''}
                    onChange={(e) => {
                      // 이메일은 자동 소문자 변환
                      const v = key === 'email' ? e.target.value.toLowerCase() : e.target.value;
                      setEditForm({ ...editForm, [key]: v });
                      setEditErrors({ ...editErrors, [key]: '' });
                    }}
                    className={editErrors[key] ? 'error' : ''}
                  />
                  {editErrors[key] && <span className="error-msg">{editErrors[key]}</span>}
                </div>
              ))}
              <div className="field">
                <label className="text-sm font-medium text-gray-700">연락처 <span className="text-red-500">*</span></label>
                <input
                  type="tel"
                  inputMode="numeric"
                  value={editForm.phone || ''}
                  onChange={(e) => { setEditForm({ ...editForm, phone: formatPhone(e.target.value) }); setEditErrors({ ...editErrors, phone: '' }); }}
                  maxLength={13}
                  className={editErrors.phone ? 'error' : ''}
                />
                {editErrors.phone && <span className="error-msg">{editErrors.phone}</span>}
              </div>
              <div className="field">
                <label className="text-sm font-medium text-gray-700">산업군 <span className="text-red-500">*</span></label>
                <select value={editForm.industry || ''} onChange={(e) => setEditForm({ ...editForm, industry: e.target.value, industry_etc: '' })} className={editErrors.industry ? 'error' : ''}>
                  <option value="">선택해주세요</option>
                  {(formOptions.industry || INDUSTRIES).map((v) => <option key={v} value={v}>{v}</option>)}
                </select>
                {editErrors.industry && <span className="error-msg">{editErrors.industry}</span>}
                {editForm.industry === '기타' && (
                  <>
                    <input type="text" value={editForm.industry_etc || ''} onChange={(e) => setEditForm({ ...editForm, industry_etc: e.target.value })} placeholder="산업군을 입력해주세요 *" className="mt-2" style={{ padding: '10px 12px', border: `1px solid ${editErrors.industry_etc ? '#ef4444' : '#e0e0e0'}`, borderRadius: 8, fontSize: 14, width: '100%' }} />
                    {editErrors.industry_etc && <span className="error-msg">{editErrors.industry_etc}</span>}
                  </>
                )}
              </div>
              <div className="field">
                <label className="text-sm font-medium text-gray-700">기업 규모 <span className="text-red-500">*</span></label>
                <select value={editForm.company_size || ''} onChange={(e) => setEditForm({ ...editForm, company_size: e.target.value })} className={editErrors.company_size ? 'error' : ''}>
                  <option value="">선택해주세요</option>
                  {(formOptions.company_size || COMPANY_SIZES).map((v) => <option key={v} value={v}>{v}</option>)}
                </select>
                {editErrors.company_size && <span className="error-msg">{editErrors.company_size}</span>}
              </div>
              <div className="field">
                <label className="text-sm font-medium text-gray-700">신청 경로 <span className="text-red-500">*</span></label>
                <select value={editForm.referral_source || ''} onChange={(e) => setEditForm({ ...editForm, referral_source: e.target.value, referral_source_etc: '', referrer_name: '' })} className={editErrors.referral_source ? 'error' : ''}>
                  <option value="">선택해주세요</option>
                  {(formOptions.referral_source || REFERRAL_SOURCES).map((v) => <option key={v} value={v}>{v}</option>)}
                </select>
                {editErrors.referral_source && <span className="error-msg">{editErrors.referral_source}</span>}
                {editForm.referral_source === '기타' && (
                  <>
                    <input type="text" value={editForm.referral_source_etc || ''} onChange={(e) => setEditForm({ ...editForm, referral_source_etc: e.target.value })} placeholder="신청 경로를 입력해주세요 *" className="mt-2" style={{ padding: '10px 12px', border: `1px solid ${editErrors.referral_source_etc ? '#ef4444' : '#e0e0e0'}`, borderRadius: 8, fontSize: 14, width: '100%' }} />
                    {editErrors.referral_source_etc && <span className="error-msg">{editErrors.referral_source_etc}</span>}
                  </>
                )}
              </div>
              {(editForm.referral_source === '클루커스 담당자 소개' || editForm.referral_source === '외부 담당자 소개') && (
                <div className="field">
                  <label className="text-sm font-medium text-gray-700">추천인 성명</label>
                  <input type="text" value={editForm.referrer_name || ''} onChange={(e) => setEditForm({ ...editForm, referrer_name: e.target.value })} placeholder="추천인 성명" />
                </div>
              )}
              <div className="field">
                <label className="text-sm font-medium text-gray-700">문의사항</label>
                <textarea rows={3} value={editForm.inquiry || ''} onChange={(e) => setEditForm({ ...editForm, inquiry: e.target.value })} placeholder="문의사항 (선택)" />
              </div>

              {/* 이벤트 전용 추가 문항 — /[slug] 의 폼과 동일한 입력 UX */}
              {customQuestions.length > 0 && (
                <div className="mt-2 pt-4 border-t border-amber-200">
                  <h3 className="text-sm font-semibold text-amber-700 mb-3">✨ 추가 문항 수정</h3>
                  <div className="space-y-4">
                    {customQuestions.map((q) => {
                      const err = editCustomErrors[q.id];
                      const setAns = (val: CustomAnswerValue) => {
                        setEditCustomAnswers((p) => ({ ...p, [q.id]: val }));
                        if (editCustomErrors[q.id]) {
                          setEditCustomErrors((p) => { const n = { ...p }; delete n[q.id]; return n; });
                        }
                      };
                      const setEtc = (val: string) => {
                        setEditCustomEtc((p) => ({ ...p, [q.id]: val }));
                        if (editCustomErrors[q.id]) {
                          setEditCustomErrors((p) => { const n = { ...p }; delete n[q.id]; return n; });
                        }
                      };
                      const v = editCustomAnswers[q.id];

                      if (q.question_type === 'short_text') {
                        return (
                          <div key={q.id} className="field">
                            <label className="text-sm font-medium text-gray-700">{q.label} {q.required && <span className="text-red-500">*</span>}</label>
                            {q.description && <p className="text-xs text-gray-500 mb-1.5">{q.description}</p>}
                            <input type="text" value={typeof v === 'string' ? v : ''} onChange={(e) => setAns(e.target.value)} className={err ? 'error' : ''} />
                            {err && <span className="error-msg">{err}</span>}
                          </div>
                        );
                      }
                      if (q.question_type === 'long_text') {
                        return (
                          <div key={q.id} className="field">
                            <label className="text-sm font-medium text-gray-700">{q.label} {q.required && <span className="text-red-500">*</span>}</label>
                            {q.description && <p className="text-xs text-gray-500 mb-1.5">{q.description}</p>}
                            <textarea rows={3} value={typeof v === 'string' ? v : ''} onChange={(e) => setAns(e.target.value)} className={err ? 'error' : ''} />
                            {err && <span className="error-msg">{err}</span>}
                          </div>
                        );
                      }
                      if (q.question_type === 'single_choice') {
                        const isEtc = v === ETC_LABEL;
                        return (
                          <div key={q.id} className="field">
                            <label className="text-sm font-medium text-gray-700">{q.label} {q.required && <span className="text-red-500">*</span>}</label>
                            {q.description && <p className="text-xs text-gray-500 mb-1.5">{q.description}</p>}
                            <div className="space-y-1.5">
                              {q.options.map((opt, i) => (
                                <label key={i} className="flex items-center gap-2 cursor-pointer">
                                  <input type="radio" name={`my-cust-${q.id}`} checked={v === opt.label} onChange={() => setAns(opt.label)} className="w-4 h-4 accent-blue-600" />
                                  <span className="text-sm">{opt.label}</span>
                                </label>
                              ))}
                              {q.allow_etc && (
                                <label className="flex items-center gap-2 cursor-pointer">
                                  <input type="radio" name={`my-cust-${q.id}`} checked={isEtc} onChange={() => setAns(ETC_LABEL)} className="w-4 h-4 accent-blue-600" />
                                  <span className="text-sm">기타 (직접 입력)</span>
                                </label>
                              )}
                            </div>
                            {q.allow_etc && isEtc && (
                              <input type="text" value={editCustomEtc[q.id] || ''} onChange={(e) => setEtc(e.target.value)} placeholder="기타 내용을 입력해주세요" className={`mt-2 ${err ? 'error' : ''}`} style={{ padding: '10px 12px', border: `1px solid ${err ? '#ef4444' : '#e0e0e0'}`, borderRadius: 8, fontSize: 14, width: '100%' }} />
                            )}
                            {err && <span className="error-msg">{err}</span>}
                          </div>
                        );
                      }
                      if (q.question_type === 'multi_choice') {
                        const arr = Array.isArray(v) ? v : [];
                        const isEtc = arr.includes(ETC_LABEL);
                        return (
                          <div key={q.id} className="field">
                            <label className="text-sm font-medium text-gray-700">{q.label} {q.required && <span className="text-red-500">*</span>}</label>
                            {q.description && <p className="text-xs text-gray-500 mb-1.5">{q.description}</p>}
                            <div className="space-y-1.5">
                              {q.options.map((opt, i) => {
                                const checked = arr.includes(opt.label);
                                return (
                                  <label key={i} className="flex items-center gap-2 cursor-pointer">
                                    <input type="checkbox" checked={checked} onChange={(e) => setAns(e.target.checked ? [...arr, opt.label] : arr.filter((x) => x !== opt.label))} className="w-4 h-4 rounded accent-blue-600" />
                                    <span className="text-sm">{opt.label}</span>
                                  </label>
                                );
                              })}
                              {q.allow_etc && (
                                <label className="flex items-center gap-2 cursor-pointer">
                                  <input type="checkbox" checked={isEtc} onChange={(e) => setAns(e.target.checked ? [...arr, ETC_LABEL] : arr.filter((x) => x !== ETC_LABEL))} className="w-4 h-4 rounded accent-blue-600" />
                                  <span className="text-sm">기타 (직접 입력)</span>
                                </label>
                              )}
                            </div>
                            {q.allow_etc && isEtc && (
                              <input type="text" value={editCustomEtc[q.id] || ''} onChange={(e) => setEtc(e.target.value)} placeholder="기타 내용을 입력해주세요" className={`mt-2 ${err ? 'error' : ''}`} style={{ padding: '10px 12px', border: `1px solid ${err ? '#ef4444' : '#e0e0e0'}`, borderRadius: 8, fontSize: 14, width: '100%' }} />
                            )}
                            {err && <span className="error-msg">{err}</span>}
                          </div>
                        );
                      }
                      if (q.question_type === 'agreement') {
                        const checked = v === true;
                        return (
                          <div key={q.id} className="field">
                            <label className="flex items-start gap-2 cursor-pointer">
                              <input type="checkbox" checked={checked} onChange={(e) => setAns(e.target.checked)} className="mt-0.5 w-4 h-4 rounded accent-blue-600" />
                              <span className="text-sm">{q.label} {q.required && <span className="text-red-500">*</span>}</span>
                            </label>
                            {err && <span className="error-msg mt-1 block">{err}</span>}
                          </div>
                        );
                      }
                      return null;
                    })}
                  </div>
                </div>
              )}
            </div>
            {!surveyWithEdit && (
              <div className="flex gap-3 mt-6">
                <button onClick={handleEditSubmit} disabled={editSubmitting} className="btn-primary flex-1">
                  {editSubmitting ? '저장 중...' : '저장하기'}
                </button>
                <button onClick={() => setEditMode(false)} className="btn-secondary flex-1">취소</button>
              </div>
            )}
          </div>
        )}

        {/* 통합 모드: 개인정보 수정 아래에 설문조사 폼 + 통합 제출 */}
        {surveyWithEdit && editMode && !surveySubmitted && (
          <div className="bg-white rounded-xl border border-gray-200 p-6 mb-4">
            <div className="flex items-center justify-between mb-1">
              <h2 className="text-lg font-bold">설문조사</h2>
            </div>
            <div className="flex items-center justify-between mb-6">
              <p className="text-sm text-gray-500">오늘의 경험에 대해 알려주세요.</p>
              <span className="text-xs text-red-500 shrink-0">* 필수</span>
            </div>

            <div className="space-y-6">
              {surveyQuestions.map((q, idx) => (
                <SurveyQuestionField
                  key={q.id}
                  q={q}
                  index={idx}
                  answer={surveyAnswers[q.id]}
                  etc={surveyEtc[q.id] || ''}
                  error={surveyErrors[q.id]}
                  etcError={surveyErrors[`${q.id}_etc`]}
                  onSingleChange={(v) => setSingleAnswer(q.id, v)}
                  onMultiToggle={(opt) => toggleMultiAnswer(q.id, opt)}
                  onTextChange={(v) => setTextAnswer(q.id, v)}
                  onEtcChange={(v) => setEtcAnswer(q.id, v)}
                  inputNamePrefix="sq"
                />
              ))}
            </div>

            <button
              onClick={async () => {
                // 개인정보 검증
                const editErrs: Record<string, string> = {};
                if (!editForm.name?.trim()) editErrs.name = '성함을 입력해주세요.';
                if (!editForm.company_name?.trim()) editErrs.company_name = '회사명을 입력해주세요.';
                if (!editForm.department?.trim()) editErrs.department = '부서명을 입력해주세요.';
                if (!editForm.job_title?.trim()) editErrs.job_title = '직급을 입력해주세요.';
                if (!editForm.email?.trim()) editErrs.email = '이메일을 입력해주세요.';
                if (!editForm.phone?.trim()) editErrs.phone = '연락처를 입력해주세요.';
                setEditErrors(editErrs);

                // 설문 검증 (동적)
                const { errors: sErrs, messages: sMsgs } = validateSurvey();
                setSurveyErrors(sErrs);

                const allErrors = [...Object.values(editErrs), ...sMsgs];
                if (allErrors.length > 0) {
                  setSurveyValidationPopup(allErrors);
                  return;
                }

                setSurveySubmitting(true);
                try {
                  // 1. 개인정보 저장 (설문 진행용이므로 서버에서 마감 체크 우회)
                  await fetch(`/api/register/${registration!.id}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ ...editForm, pin, force_survey_edit: true }),
                  });

                  // 2. 설문 제출 (동적 answers 페이로드)
                  const answers = buildSurveyAnswers();
                  const surveyRes = await fetch('/api/survey', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      registration_id: registration!.id, pin,
                      answers,
                    }),
                  });
                  const surveyData = await surveyRes.json();
                  if (!surveyRes.ok) { alert(surveyData.error || '제출에 실패했습니다.'); return; }

                  setSurveySubmitted(true);
                  setEditMode(false);
                  setSurveyWithEdit(false);
                  if (registration) {
                    setRegistration({ ...registration, survey_completed: true });
                    trackSurveyComplete(registration.event_name, registration.event_category || '');
                  }
                } catch { alert('네트워크 오류가 발생했습니다.'); }
                finally { setSurveySubmitting(false); }
              }}
              disabled={surveySubmitting}
              className="btn-primary w-full mt-6"
            >
              {surveySubmitting ? '제출 중...' : '제출하기'}
            </button>
            <button onClick={() => { setEditMode(false); setSurveyWithEdit(false); }} className="w-full text-sm text-gray-400 hover:text-gray-600 mt-2">취소</button>
          </div>
        )}

        {/* 버튼 그룹 */}
        {!editMode && !showSurvey && !showSurveyChoice && (
          <div className="flex gap-3 mb-4">
            <a href="/" className="btn-primary flex-1 text-center" style={{ padding: '12px 0', fontSize: 15 }}>
              확인 완료
            </a>
            {canEditInfo && (
              <button onClick={startEdit} className="btn-secondary flex-1" style={{ padding: '12px 0', fontSize: 15, fontWeight: 600 }}>
                수정하기
              </button>
            )}
            {canEditInfo && (
              <button
                onClick={() => { trackClick('register-cancel-open'); setShowCancelConfirm(true); setCancelError(null); }}
                className="btn-danger flex-1"
                style={{ padding: '12px 0', fontSize: 15, fontWeight: 600 }}
              >
                등록 취소
              </button>
            )}
          </div>
        )}

      </main>

      <BrandFooter />

      {/* 등록 취소 확인 모달 */}
      {showCancelConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: 'rgba(0,0,0,0.4)' }}>
          <div className="bg-white rounded-xl shadow-xl max-w-sm w-full p-6 text-center">
            <h3 className="text-lg font-bold mb-2">등록을 취소하시겠습니까?</h3>
            <p className="text-sm text-gray-500 mb-6">취소 후에는 다시 등록해야 합니다.</p>
            {cancelError && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4 text-left">
                <div className="flex items-start gap-2">
                  <span className="text-red-500 text-sm shrink-0">⚠️</span>
                  <p className="text-xs text-red-700 leading-relaxed whitespace-pre-line">{cancelError}</p>
                </div>
              </div>
            )}
            <div className="flex gap-3">
              <button
                onClick={() => { setShowCancelConfirm(false); setCancelError(null); }}
                className="btn-secondary flex-1"
                disabled={cancelling}
              >
                아니오
              </button>
              <button onClick={handleCancel} disabled={cancelling} className="btn-danger flex-1">
                {cancelling ? '취소 중...' : cancelError ? '다시 시도' : '등록 취소'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
