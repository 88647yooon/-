// 웹 화면의 왼쪽 메뉴. 메뉴는 그 화면의 권한 키가 있을 때만 보인다 (화면 경로에도 같은 권한 키가 걸려 있다).
// match: 이 메뉴가 선택된 것으로 볼 경로 (기본: href로 시작하는 경로)

const ICONS = {
  home: 'M3 11l9-8 9 8M5 10v10h5v-6h4v6h5V10',
  calendar: 'M4 6h16v15H4zM4 10h16M8 3v4M16 3v4M8 14h3M8 17h6',
  tasks: 'M9 3h6v4H9zM7 5H5v16h14V5h-2M9 13l2 2 4-4',
  users: 'M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2M9 11a4 4 0 100-8 4 4 0 000 8M22 21v-2a4 4 0 00-3-3.9M16 3.1a4 4 0 010 7.8',
  crew: 'M10 3h4v4h-4zM3 17h4v4H3zM10 17h4v4h-4zM17 17h4v4h-4zM12 7v10M5 17v-3h14v3',
  userCheck: 'M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2M9 11a4 4 0 100-8 4 4 0 000 8M16 11l2 2 4-4',
  key: 'M15 3a6 6 0 00-5.6 8.2L3 17.6V21h3.4l.6-.6V18h2.4v-2.4H12l1.2-1.2A6 6 0 1015 3zM16.5 7.5h.01',
  box: 'M21 8l-9-5-9 5 9 5 9-5zM3 8v8l9 5 9-5V8M12 13v8',
  star: 'M12 3l2.8 5.7 6.2.9-4.5 4.4 1.1 6.2L12 17.3l-5.6 2.9 1.1-6.2L3 9.6l6.2-.9z',
  file: 'M14 3H6v18h12V7zM14 3v4h4M9 12h6M9 16h6',
  chart: 'M4 20V11M10 20V5M16 20v-6M2 20h20',
  search: 'M11 18a7 7 0 100-14 7 7 0 000 14zM21 21l-5-5',
  sliders: 'M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6',
  user: 'M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2M12 11a4 4 0 100-8 4 4 0 000 8',
  code: 'M16 18l6-6-6-6M8 6l-6 6 6 6',
  logout: 'M9 21H5V3h4M16 17l5-5-5-5M21 12H9',
  menu: 'M3 6h18M3 12h18M3 18h18',
};

const NAV = [
  { label: null, items: [{ href: '/', label: '업무 홈', icon: 'home', match: (p) => p === '/' }] },
  {
    label: '업무',
    items: [
      // 업무 목록을 볼 수 없는 구성원은 업무 상세를 내 업무에서 연다.
      { href: '/my-tasks', label: '내 업무', icon: 'calendar', perm: 'task.participate', match: (p, can) => p === '/my-tasks' || (p.startsWith('/tasks/') && !can('task.list')) },
      { href: '/tasks', label: '업무 관리', icon: 'tasks', perm: 'task.list' },
    ],
  },
  {
    label: '조직',
    items: [
      { href: '/users', label: '구성원', icon: 'users', perm: 'user.list' },
      { href: '/crews', label: 'Crew', icon: 'crew', perm: 'crew.read' },
      { href: '/role-requests', label: '역할 변경 요청', icon: 'userCheck', perm: 'roleRequest.read' },
    ],
  },
  {
    label: '자원',
    items: [
      { href: '/my-resources', label: '내 자원', icon: 'key', perm: 'resource.use' },
      { href: '/resources', label: '공용 자원', icon: 'box', perm: 'resource.read' },
    ],
  },
  {
    label: '평가·기록',
    items: [
      { href: '/evaluations', label: '평가', icon: 'star', perm: 'evaluation.appeal' },
      { href: '/audit-logs', label: '감사 기록', icon: 'file', perm: 'audit.read' },
    ],
  },
  {
    label: '분석',
    items: [
      { href: '/dashboard', label: '운영 현황', icon: 'chart', perm: 'stats.read' },
      { href: '/search', label: '통합 검색', icon: 'search', perm: 'search.use', match: (p) => p.startsWith('/search') || p.startsWith('/saved-searches') },
    ],
  },
  { label: '시스템', items: [{ href: '/admin', label: '시스템 관리', icon: 'sliders', perm: 'admin.accounts' }] },
];

const matches = (item, path, can) => (item.match ? item.match(path, can) : path === item.href || path.startsWith(`${item.href}/`));

// 이 사용자에게 보이는 메뉴와 지금 경로에 해당하는 메뉴
function navFor(path, can) {
  const groups = NAV
    .map((g) => ({ label: g.label, items: g.items.filter((i) => !i.perm || can(i.perm)) }))
    .filter((g) => g.items.length > 0);
  let current = null;
  for (const g of groups) {
    for (const item of g.items) {
      if (!current && matches(item, path, can)) current = { group: g.label, item };
    }
  }
  if (!current && (path === '/me' || path.startsWith('/me/'))) current = { group: null, item: { href: '/me', label: '내 정보' } };
  return { groups, current };
}

module.exports = { NAV, ICONS, navFor };
