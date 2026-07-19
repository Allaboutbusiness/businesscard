// [임시 진단] 서버가 받는 쿠키 이름·okr_session 중복 개수만 반환(값 노출 없음). 확인 후 삭제 예정.
module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store, private');
  const raw = req.headers.cookie || '';
  const names = raw.split(';').map((s) => s.trim().split('=')[0]).filter(Boolean);
  const okrSessionCount = names.filter((n) => n === 'okr_session').length;
  res.json({ names, okrSessionCount, rawLen: raw.length });
};
