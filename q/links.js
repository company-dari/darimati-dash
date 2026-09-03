/* 배포할 때 자동으로 다시 구워지는 파일 — 손으로 고칠 필요 없습니다.
   (qr/snapshot.py 가 구글시트를 읽어서 여기에 덮어씁니다)

   왜 있냐면: 구글이 잠깐 느리거나 죽어도 인쇄된 QR이 살아 있어야 하기 때문입니다.
   평소에는 안 쓰이고, 실시간 조회가 실패한 순간에만 이 값이 손님을 구합니다. */
window.QR = {
  api: "https://script.google.com/macros/s/AKfycbx4EqPZxQlkC6u9EDUq9ttWf5cuoRnvaurxuEBnd0MZWOq6w1q_Vjjdax5vPeob_kLinQ/exec",
  map: {
    "join": "https://www.darimati.us/pages/join",
    "coach": "https://www.darimati.us/pages/coach",
    "f45-yeonsinnae": "https://www.darimati.us/pages/br001-f45-yeonsinnae",
    "f45-boramae": "https://www.darimati.us/pages/br001-f45-boramae",
    "f45-sinyongsan": "https://www.darimati.us/pages/br001-f45-sinyongsan",
    "anytime": "https://www.darimati.us/pages/br001-anytime",
    "f45-hapjeong": "https://www.darimati.us/pages/br001-f45-hapjeong",
    "f45-dangsan": "https://www.darimati.us/pages/br001-f45-dangsan",
    "f45-songdo": "https://www.darimati.us/pages/br001-f45-songdo",
    "f45-suyu": "https://www.darimati.us/pages/br001-f45-suyu",
    "f45-beomgye": "https://www.darimati.us/pages/br001-f45-beomgye",
    "f45-yeouido": "https://www.darimati.us/pages/br001-f45-yeouido",
    "f45-bupyeong": "https://www.darimati.us/pages/br001-f45-bupyeong",
    "f45-cheongna": "https://www.darimati.us/pages/br001-f45-cheongna",
    "f45-hwajeong": "https://www.darimati.us/pages/br001-f45-hwajeong",
    "mangrove": "https://darimati.github.io/inventory-dashboard/qr-mangrove.html",
    "hyundai-popup": "https://www.darimati.us/pages/join",
    "rungongdeok": "https://brand.naver.com/darimati/products/13735873447?nt_source=rungongdeok&nt_medium=branch&nt_detail=all&nt_keyword=qr",
    "crossfit-jungsim": "https://brand.naver.com/darimati/products/13735873146?nt_source=crossfit&nt_medium=branch&nt_detail=jungsim&nt_keyword=qr",
    "f45-yeoksam": "https://www.darimati.us/pages/br001-f45-yeoksam",
    "f45-gangnam": "https://www.darimati.us/pages/br001-f45-gangnam",
    "f45-gwanghwamun": "https://www.darimati.us/pages/br001-f45-gwanghwamun",
    "f45-gongdeok": "https://www.darimati.us/pages/br001-f45-gongdeok",
    "f45-gyodae": "https://www.darimati.us/pages/br001-f45-gyodae"
  }
};
