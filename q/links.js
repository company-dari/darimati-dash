/* 배포할 때 자동으로 다시 구워지는 파일 — 손으로 고칠 필요 없습니다.
   (qr/snapshot.py 가 구글시트를 읽어서 여기에 덮어씁니다)

   왜 있냐면: 구글이 잠깐 느리거나 죽어도 인쇄된 QR이 살아 있어야 하기 때문입니다.
   평소에는 안 쓰이고, 실시간 조회가 실패한 순간에만 이 값이 손님을 구합니다. */
window.QR = {
  api: "https://script.google.com/macros/s/AKfycbx4EqPZxQlkC6u9EDUq9ttWf5cuoRnvaurxuEBnd0MZWOq6w1q_Vjjdax5vPeob_kLinQ/exec",
  map: {
    "join": "https://www.darimati.us/pages/join"
  }
};
