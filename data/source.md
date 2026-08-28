<!--
  WebCheck 지식 원본 — MDN Web Docs 발췌·압축

  출처와 라이선스
    본 파일의 내용은 MDN Web Docs 를 근거로 사실 단위로 압축한 것입니다.
    MDN Web Docs 의 문서는 CC-BY-SA 2.5 라이선스를 따릅니다.
    각 청크는 자신이 유래한 MDN 문서와 섹션 앵커를 url 로 지니며,
    화면에서 그 링크가 사용자에게 그대로 노출됩니다.
      https://developer.mozilla.org/ko/docs/Web/HTTP/Guides/Overview
      https://developer.mozilla.org/ko/docs/Learn_web_development/Core/Styling_basics/Box_model

  이 청크들이 하는 일 (PRD 7장)
    요소별 상태 판정에는 쓰이지 않습니다. 판정은 오직 루브릭이 합니다.
    청크는 다음 세 자리에서만 쓰입니다.
      1. 범위 판정과 거절 — 사용자 발화가 자료 안인지 밖인지 (유사도 임계값)
      2. 오개념 교정의 출처 — 왜 그것이 오개념인지의 근거
      3. Hint 3 의 원문 문단 선택

  형식 규칙
    1. "## " 로 시작하는 줄  ... 청크의 section 필드
    2. url 지시자 한 줄       ... HTML 주석 안에 "url: 주소" 만 적은 줄
    3. "- " 로 시작하는 줄   ... 청크 1개. 사실 단위 한 덩어리

  주의: 이 설명 주석 안에는 주석 종료 기호를 쓰지 않습니다.
  파서가 주석의 끝으로 오해합니다.
-->

## HTTP · 개요
<!-- url: https://developer.mozilla.org/ko/docs/Web/HTTP/Guides/Overview -->
- HTTP는 HTML 문서와 같은 리소스를 가져올 수 있게 해주는 프로토콜이며, 웹에서 이루어지는 모든 데이터 교환의 기초입니다.
- HTTP는 클라이언트-서버 프로토콜입니다. 클라이언트-서버 프로토콜이란 보통 웹브라우저인 수신자 측에 의해 요청이 초기화되는 프로토콜을 뜻합니다.
- 클라이언트와 서버는 데이터 스트림이 아니라 개별적인 메시지 교환으로 통신합니다. 클라이언트가 보내는 메시지를 요청이라 부르고, 서버가 돌려보내는 메시지를 응답이라 부릅니다.
- 하나의 완전한 웹 문서는 텍스트, 레이아웃 설명, 이미지, 비디오, 스크립트 등 여러 번에 걸쳐 가져온 하위 문서들로 재구성됩니다.
- HTTP는 애플리케이션 계층의 프로토콜이며, 신뢰할 수 있는 전송 프로토콜 위에서 동작합니다. 보통 TCP 또는 암호화된 TCP 연결인 TLS를 통해 전송됩니다.

## HTTP · 클라이언트
<!-- url: https://developer.mozilla.org/ko/docs/Web/HTTP/Guides/Overview#클라이언트_사용자_에이전트 -->
- 사용자 에이전트는 사용자를 대신하여 동작하는 도구이며, 이 역할은 주로 브라우저가 수행합니다.
- 브라우저는 항상 요청을 보내는 개체이며, 결코 서버가 될 수 없습니다. 통신의 방향은 이렇게 비대칭입니다.
- 브라우저는 웹 페이지를 표시하기 위해 먼저 HTML 문서를 가져오는 요청을 보내고, 그 파일을 해석해 스크립트와 이미지와 CSS 같은 하위 리소스를 가져오는 추가 요청을 보냅니다.
- 브라우저는 사용자의 조작을 HTTP 요청으로 변환하고, 돌아온 HTTP 응답을 해석해 사용자에게 표시합니다.

## HTTP · 서버
<!-- url: https://developer.mozilla.org/ko/docs/Web/HTTP/Guides/Overview#웹_서버 -->
- 통신 채널의 반대편에는 클라이언트의 요청에 대해 문서를 제공하는 서버가 있습니다.
- 서버는 논리적으로는 하나이지만 실제로는 여러 대의 기계가 부하를 나누어 지는 집합일 수 있고, 반대로 한 기계 위에 여러 서버를 호스팅할 수도 있습니다.

## HTTP · 흐름
<!-- url: https://developer.mozilla.org/ko/docs/Web/HTTP/Guides/Overview#http_흐름 -->
- 클라이언트가 서버와 통신할 때의 순서는 TCP 연결을 열고, HTTP 메시지를 전송하고, 서버가 보낸 응답을 읽고, 연결을 닫거나 다른 요청을 위해 재사용하는 것입니다.
- 클라이언트는 새 연결을 열 수도, 기존 연결을 재사용할 수도, 서버에 대해 여러 TCP 연결을 열 수도 있습니다.
- HTTP/2 이전의 HTTP 메시지는 사람이 읽을 수 있는 형태였습니다. HTTP/2에서는 메시지가 프레임 안에 캡슐화되어 직접 읽을 수 없지만 원칙은 같습니다.

## HTTP · 요청
<!-- url: https://developer.mozilla.org/ko/docs/Web/HTTP/Guides/Overview#요청 -->
- 요청은 HTTP 메서드, 가져오려는 리소스의 경로, HTTP 프로토콜의 버전, 선택적인 헤더들, 그리고 경우에 따라 본문으로 구성됩니다.
- HTTP 메서드는 클라이언트가 수행하려는 동작을 정의합니다. GET은 리소스를 가져올 때, POST는 폼 데이터를 전송할 때 주로 쓰입니다.
- 요청의 경로는 프로토콜과 도메인과 포트를 제외한 리소스의 URL 부분입니다.

## HTTP · 응답
<!-- url: https://developer.mozilla.org/ko/docs/Web/HTTP/Guides/Overview#응답 -->
- 응답은 HTTP 프로토콜의 버전, 상태 코드, 상태 메시지, 헤더들, 그리고 선택적으로 가져온 리소스가 담긴 본문으로 구성됩니다.
- 상태 코드는 요청의 성공 여부와 그 이유를 나타내고, 상태 메시지는 그 상태 코드의 짧은 설명입니다.

## HTTP · 상태 비저장
<!-- url: https://developer.mozilla.org/ko/docs/Web/HTTP/Guides/Overview#http은_상태는_없지만_세션은_있습니다 -->
- HTTP는 상태를 저장하지 않습니다. 같은 연결 위에서 연이어 전달된 두 요청 사이에는 연결고리가 없습니다.
- 상태가 없다는 성질은 쇼핑 바구니처럼 일관된 상호작용이 필요할 때 문제가 되는데, HTTP 쿠키가 요청들 사이에 상태를 공유하는 세션을 만들어 이를 해결합니다.

## HTTP · 연결
<!-- url: https://developer.mozilla.org/ko/docs/Web/HTTP/Guides/Overview#http와_연결 -->
- 연결은 전송 계층에서 제어되므로 근본적으로 HTTP의 영역 밖입니다. HTTP는 특정 전송 프로토콜을 요구하지 않고, 신뢰할 수 있는 연결만을 요구합니다.
- HTTP는 연결이 필수는 아니지만 연결 기반인 TCP 표준에 의존합니다. 요청과 응답을 교환하기 전에 TCP 연결을 먼저 설정해야 합니다.
- HTTP/1.0은 요청과 응답마다 별도의 TCP 연결을 열었고, HTTP/1.1은 지속적인 연결 개념을, HTTP/2는 단일 연결 위의 다중 전송을 도입했습니다.

## 박스 모델 · 블록과 인라인
<!-- url: https://developer.mozilla.org/ko/docs/Learn_web_development/Core/Styling_basics/Box_model#블록_및_인라인_박스 -->
- CSS에는 크게 블록 박스와 인라인 박스 두 유형이 있으며, 이 유형이 박스가 다른 박스와 어떻게 어울리는지를 결정합니다.
- 블록 박스는 새 줄로 행갈이를 하고, 상위 컨테이너의 가용 공간을 채우며, width와 height 속성이 적용되고, 패딩과 여백과 테두리가 다른 요소를 밀어냅니다.
- 인라인 박스는 새 줄로 행갈이를 하지 않고, width와 height 속성이 적용되지 않으며, 패딩과 여백과 테두리가 다른 인라인 박스를 밀어내지 않습니다.
- h1이나 p 같은 요소는 기본값이 블록이고, a와 span과 em과 strong 같은 요소는 기본값이 인라인입니다. 이 유형은 display 속성으로 바꿉니다.

## 박스 모델 · 박스의 구성
<!-- url: https://developer.mozilla.org/ko/docs/Learn_web_development/Core/Styling_basics/Box_model#box의_구성 -->
- 콘텐츠 박스는 콘텐츠가 표시되는 영역이며, 그 크기는 width와 height 같은 속성으로 정합니다.
- 패딩 박스는 콘텐츠 주변에 공백처럼 자리잡으며, 그 크기는 padding 관련 속성으로 제어합니다.
- 테두리 박스는 콘텐츠와 패딩까지 둘러싸며, 그 크기와 스타일은 border 관련 속성으로 제어합니다.
- 여백 박스는 가장 바깥 층으로 콘텐츠와 패딩과 테두리를 둘러싸면서, 이 박스와 다른 요소 사이의 공백 역할을 합니다. 그 크기는 margin 관련 속성으로 제어합니다.

## 박스 모델 · 표준 모델
<!-- url: https://developer.mozilla.org/ko/docs/Learn_web_development/Core/Styling_basics/Box_model#표준_css_박스_모델 -->
- 표준 박스 모델에서 width와 height를 부여하면 그것은 콘텐츠 박스의 너비와 높이를 정의합니다.
- 표준 박스 모델에서는 패딩과 테두리가 박스의 너비와 높이에 더해져 박스가 점유하는 전체 크기가 정해집니다. 그래서 width가 300px이고 좌우 패딩이 각 20px, 테두리가 각 5px이면 실제 점유 폭은 350px이 됩니다.
- 여백은 박스의 실제 크기에 포함되지 않습니다. 박스의 영역은 테두리에서 멈추며 여백으로 확장되지 않습니다. 여백은 박스가 페이지에서 차지하는 총 공간에는 영향을 주지만 박스 외부에만 작용합니다.

## 박스 모델 · 대체 모델
<!-- url: https://developer.mozilla.org/ko/docs/Learn_web_development/Core/Styling_basics/Box_model#대체_css_박스_모델 -->
- 대체 박스 모델에서 width는 페이지에 표시되는 박스의 너비를 뜻하며, 콘텐츠 영역의 너비는 그 값에서 패딩과 테두리를 뺀 나머지가 됩니다.
- 브라우저는 기본값으로 표준 박스 모델을 사용합니다. 어떤 요소에 대체 모델을 켜려면 그 요소에 box-sizing 속성을 border-box로 설정합니다.
- 모든 요소가 대체 박스 모델을 쓰게 하려면 html 요소에 box-sizing을 설정하고 다른 모든 요소가 그 값을 상속하도록 합니다. 이것은 개발자들의 흔한 선택입니다.

## 박스 모델 · 여백
<!-- url: https://developer.mozilla.org/ko/docs/Learn_web_development/Core/Styling_basics/Box_model#여백 -->
- 여백은 박스 주변의 보이지 않는 공간이며, 박스로부터 다른 요소를 밀어냅니다.
- 여백은 양수값과 음수값을 모두 가질 수 있습니다. 한쪽에 음수 여백을 주면 페이지의 다른 부분과 겹칠 수 있습니다.
- 표준 모델을 쓰든 대체 모델을 쓰든, 여백은 표시되는 박스의 크기를 계산한 뒤에 더해집니다.
- 여백이 서로 맞닿은 두 요소가 있으면 두 여백은 합쳐져 하나가 되며, 그 크기는 둘 중 더 큰 쪽이 됩니다. 이것을 여백 축소라고 부릅니다.

## 박스 모델 · 테두리
<!-- url: https://developer.mozilla.org/ko/docs/Learn_web_development/Core/Styling_basics/Box_model#테두리 -->
- 테두리는 박스의 여백과 패딩 사이에 그려집니다.
- 표준 박스 모델에서는 테두리의 크기가 박스의 width와 height에 더해집니다. 대체 박스 모델에서는 테두리가 정해진 width와 height의 일부를 차지하므로 콘텐츠 박스가 그만큼 작아집니다.

## 박스 모델 · 패딩
<!-- url: https://developer.mozilla.org/ko/docs/Learn_web_development/Core/Styling_basics/Box_model#패딩 -->
- 패딩은 테두리와 콘텐츠 영역 사이에 위치합니다.
- 여백과 달리 패딩은 음수값을 가질 수 없으며 0 또는 양수여야 합니다. 요소에 적용된 배경은 패딩 뒤에 표시됩니다.
- 패딩의 전형적인 용도는 테두리에서 콘텐츠를 밀어내는 것입니다.
