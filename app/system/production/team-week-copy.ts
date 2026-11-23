/** Copy for Team overview > Team planner (TeamBoard.tsx, lib/team-week.ts); merged into DICTIONARY (i18n.ts). Namespaced keys only. */
export const TEAM_WEEK_COPY: Record<string, { en: string; th: string; jp: string }> = Object.fromEntries(
  [
    // Team planner (owner decision 2026-11-23): the daily grid and Team week in one tab; the key stays for links and activity.
    ["TeamWeek.tab", "Team planner", "แผนงานทีม", "チームプランナー"],
    ["TeamOverview.moreViews", "More views", "มุมมองอื่น", "その他の表示"],
    [
      "TeamWeek.subtitle",
      "Everyone's days in hours over one, two or four weeks: the hours confirmed, else booked on My week, else planned. Time away comes off the day.",
      "งานของทุกคนเป็นชั่วโมงรายวัน ดูได้ 1, 2 หรือ 4 สัปดาห์ ใช้ชั่วโมงที่ยืนยันแล้ว ถ้ายังไม่ยืนยันใช้ที่จองใน My week ถ้ายังไม่จองใช้ตามแผน วันลาหักออกจากเวลาที่มี",
      "全員の日ごとの時間を1・2・4週で表示：確定済みの時間、未確定ならマイウィークの予約、未予約なら計画。不在はその日の持ち時間から差し引きます。",
    ],
    ["TeamWeek.chipOver", "Over capacity", "เกินกำลัง", "負荷超過"],
    ["TeamWeek.chipFree", "8 h or more free", "ว่าง 8 ชม. ขึ้นไป", "8時間以上空き"],
    ["TeamWeek.chipPending", "Hours not confirmed", "ยังไม่ยืนยันชั่วโมง", "時間未確定"],
    ["TeamWeek.chipLeave", "Time away", "มีวันลา", "休暇あり"],
    ["TeamWeek.unconfirmed", "Not confirmed", "ยังไม่ยืนยัน", "未確定"],
    // What a day booked on My week holds, as the day panel lists it.
    ["TeamWeek.meetings", "Meetings", "ประชุม / นัด", "会議・予定"],
    ["TeamWeek.other", "Other work", "งานอื่น", "その他の作業"],
    ["TeamWeek.work", "Work", "งาน", "作業"],
    ["TeamWeek.estimate", "Estimate", "Estimate", "見積"],
    ["TeamWeek.inquiry", "Inquiry", "Inquiry", "引合"],
    ["TeamWeek.issue", "Customer issue", "Issue ลูกค้า", "顧客課題"],
    ["TeamWeek.teamTask", "Team task", "งานทีม", "チームタスク"],
    ["TeamWeek.away", "Away", "ลา", "不在"],
  ].map(([key, en, th, jp]) => [key, { en: en!, th: th!, jp: jp! }]),
);
