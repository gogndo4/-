---
tags: [template, dataview]
---

# 하루자존 Dataview 쿼리 모음

0.나 노트에 붙여 넣거나 별도 노트에서 사용하세요.
Dataview 플러그인이 설치되어 있어야 합니다.

---

## 이번 달 자존 모아보기

```dataview
LIST rows.text
FROM "Daily"
WHERE contains(text, dateformat(date(today), "YYYY-MM"))
FLATTEN file.lists AS text
WHERE contains(string(text), dateformat(date(today), "YYYY-MM"))
```

---

## 월별 기록 개수 (꾸준함 트래킹)

0.나 노트 하루자존 섹션에 아래처럼 inline field를 추가하면 월별 카운트가 가능합니다.

예시 형식 (0.나 노트에서):
```
- 2026-06-14 - 회의에서 좋은 아이디어를 냈다 [자존:: 1]
```

```dataview
TABLE length(rows) AS "기록 수"
FROM "0.나"
FLATTEN file.lists AS item
WHERE contains(string(item), "자존::")
GROUP BY dateformat(date(substring(string(item), 2, 12)), "YYYY-MM") AS 월
SORT 월 DESC
```

---

## 키워드 빈도 확인 (수동 분석용)

0.나 노트를 열고 Ctrl+F 로 자주 쓰는 단어를 검색하면
나의 강점 키워드를 파악할 수 있습니다.

예: "발표", "운동", "도움", "완료", "해결" 등을 검색해보세요.

---

## 주간 하이라이트 선정 (매주 일요일 회고용)

```dataview
LIST text
FROM "Daily"
WHERE date >= date(today) - dur(7 days)
FLATTEN file.lists AS text
WHERE contains(string(text), "자존")
SORT file.name DESC
```
