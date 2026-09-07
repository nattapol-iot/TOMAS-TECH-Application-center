"use client";

import { useState } from "react";
import { useLanguage, type Lang } from "../i18n";
import { Icon } from "../ui";
import "./employee-manual.css";

const MANUAL_PATH = "/manual/employee-operation-manual.html";

const COPY = {
  TH: {
    nav: "คู่มือการใช้งาน",
    eyebrow: "ศูนย์ช่วยเหลือสำหรับพนักงาน",
    title: "คู่มือการใช้งาน IoT Team Center",
    subtitle: "ค้นหาขั้นตอนการทำงาน อ่านคำอธิบายพร้อมภาพหน้าจอจริง และพิมพ์หรือดาวน์โหลดไว้ใช้ออฟไลน์ได้",
    open: "เปิดเต็มหน้าจอ",
    download: "ดาวน์โหลดคู่มือ",
    languages: "ไทย · 日本語 · English",
    screenshots: "ภาพหน้าจอจริง",
    offline: "อ่านออฟไลน์ได้",
    loading: "กำลังเปิดคู่มือ…",
    frameTitle: "คู่มือปฏิบัติงานสำหรับพนักงาน",
    hint: "ภาษาของคู่มือจะเปลี่ยนตามภาษาที่เลือกบนแถบด้านบน ใช้สารบัญหรือช่องค้นหาภายในคู่มือเพื่อไปยังงานที่ต้องการ",
  },
  EN: {
    nav: "Employee Manual",
    eyebrow: "Employee help centre",
    title: "IoT Team Center Employee Manual",
    subtitle: "Find operating procedures, follow guidance with real application screenshots, and print or download an offline copy.",
    open: "Open full screen",
    download: "Download manual",
    languages: "ไทย · 日本語 · English",
    screenshots: "Real screenshots",
    offline: "Available offline",
    loading: "Opening the manual…",
    frameTitle: "Employee operation manual",
    hint: "The manual follows the language selected in the top bar. Use its contents or search to find the task you need.",
  },
  JP: {
    nav: "操作マニュアル",
    eyebrow: "従業員ヘルプセンター",
    title: "IoT Team Center 操作マニュアル",
    subtitle: "実画面付きの操作手順を検索し、印刷またはダウンロードしてオフラインでも閲覧できます。",
    open: "全画面で開く",
    download: "マニュアルを保存",
    languages: "ไทย · 日本語 · English",
    screenshots: "実画面を掲載",
    offline: "オフライン対応",
    loading: "マニュアルを開いています…",
    frameTitle: "従業員向け操作マニュアル",
    hint: "マニュアルは上部バーで選択した言語に切り替わります。目次または検索から必要な業務を探してください。",
  },
} as const;

export const employeeManualLabel = (language: Lang) => COPY[language].nav;

export function EmployeeManualScreen() {
  const { lang } = useLanguage();
  const copy = COPY[lang];
  const manualLanguage = lang === "JP" ? "ja" : lang.toLowerCase();
  const fullUrl = `${MANUAL_PATH}?lang=${manualLanguage}`;
  const frameUrl = `${fullUrl}&embedded=1`;
  const [loadedUrl, setLoadedUrl] = useState("");
  const loaded = loadedUrl === frameUrl;

  return (
    <section className="employee-manual-screen">
      <header className="employee-manual-hero">
        <div className="employee-manual-mark"><Icon name="book" /></div>
        <div className="employee-manual-heading">
          <p>{copy.eyebrow}</p>
          <h1>{copy.title}</h1>
          <span>{copy.subtitle}</span>
          <div className="employee-manual-features" aria-label={copy.languages}>
            <small><Icon name="globe" />{copy.languages}</small>
            <small><Icon name="eye" />{copy.screenshots}</small>
            <small><Icon name="download" />{copy.offline}</small>
          </div>
        </div>
        <div className="employee-manual-actions">
          <a className="btn primary" href={fullUrl} target="_blank" rel="noreferrer"><Icon name="externalLink" />{copy.open}</a>
          <a className="btn default" href={MANUAL_PATH} download="IoT-Team-Center-Employee-Manual.html"><Icon name="download" />{copy.download}</a>
        </div>
      </header>

      <p className="employee-manual-hint"><Icon name="book" />{copy.hint}</p>

      <div className="employee-manual-frame" aria-busy={!loaded}>
        {!loaded ? <div className="employee-manual-loading" role="status"><span className="spinner" />{copy.loading}</div> : null}
        <iframe
          key={frameUrl}
          src={frameUrl}
          title={copy.frameTitle}
          onLoad={() => setLoadedUrl(frameUrl)}
          loading="eager"
          sandbox="allow-same-origin allow-scripts allow-modals"
        />
      </div>
    </section>
  );
}
