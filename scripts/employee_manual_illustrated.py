"""Render a multilingual, illustrated, offline employee handbook."""
from pathlib import Path
from html import escape
import base64
import hashlib
import json
import re

from employee_manual_translations import LOCALES

ROOT = Path(__file__).resolve().parents[1]
SHOT_DIR = ROOT / 'docs/manual/screenshots'
FONT_DIR = ROOT / 'docs/manual/fonts'

# Each screenshot is an unaltered capture of the real application UI.
# Keys are grouped by the chapter where the pictured controls are explained.
FIGURES = {
    'dashboard': ['dashboard'], 'customers': ['master'],
    'inquiry': ['inquiry', 'inquiry-detail'], 'visit-request': ['site-visits'],
    'visits': ['site-visits'], 'assignments': ['assignments'],
    'estimate': ['estimate-summary', 'estimate-cost'], 'effort': ['estimate-effort'],
    'estimate-import': ['module-templates'], 'estimate-review': ['estimate-validation'],
    'pricing': ['pricing', 'quotations', 'waiting-price'], 'projects': ['projects'],
    'schedule': ['schedule'], 'resources': ['resources', 'timeline'],
    'my-work': ['my-work', 'my-work-schedule'], 'punchlist': ['punchlist'],
    'procurement': ['procurement', 'bom'], 'pr': ['pr'], 'historical-pr': ['pr'],
    'po': ['po'], 'receiving': ['receiving'], 'inventory': ['inventory'],
    'issues': ['issues'], 'knowledge': ['knowledge'], 'signature': ['stamps'],
    'signing': ['signing'], 'reports': ['reports'],
    'report-templates': ['report-templates'], 'analytics': ['analytics'],
    'performance': ['performance'], 'support': ['support', 'support-create'],
    'master': ['master'], 'visit-master': ['visit-master'], 'audit-settings': ['settings'],
}


def triple(text):
    values = text.split('||')
    if len(values) != 3:
        raise ValueError(text)
    return dict(zip(['th', 'en', 'ja'], [v.strip() for v in values]))


CAPTIONS = {key: triple(value) for key, value in {
    'dashboard': 'Dashboard · ภาพรวมงานของบัญชีที่ใช้งาน || Dashboard · work overview for the signed-in account || Dashboard・ログイン中アカウントの業務概要',
    'inquiry': 'Inquiry · ค้นหา กรอง และเปิดเรื่องลูกค้า || Inquiry · search, filter and open customer work || Inquiry・顧客案件の検索・絞り込み・詳細',
    'inquiry-detail': 'Inquiry Overview · ตรวจเจ้าของงานและเปิดแท็บข้อมูลที่เกี่ยวข้อง || Inquiry Overview · ownership and related information tabs || Inquiry Overview・担当者と関連情報タブ',
    'estimate-summary': 'Estimate Summary · ตรวจเลขฉบับและต้นทุนรวม || Estimate Summary · revision and total costs || Estimate Summary・版と原価合計',
    'estimate-cost': 'Cost Items · รายการใน Category และ Module || Cost Items · category and module line items || Cost Items・分類とModuleの明細',
    'estimate-effort': 'Engineering Man-hour · พื้นที่ Work package และต้นทุนแรงงาน || Engineering Man-hour · work packages and labor costs || Engineering Man-hour・Work packageと労務原価',
    'estimate-validation': 'Validation · ตรวจรายการที่ต้องแก้ก่อนส่งต่อ || Validation · review issues before submission || Validation・提出前の指摘事項確認',
    'projects': 'Project Portfolio · ค้นหาโครงการและเปิด Documents || Project Portfolio · find projects and open Documents || Project Portfolio・プロジェクト検索とDocuments',
    'schedule': 'Project Schedule · งาน ผู้รับผิดชอบ และวันที่ในแผน || Project Schedule · tasks, owners and planned dates || Project Schedule・業務、担当者、計画日',
    'punchlist': 'Punchlist · รายการ Issue ลูกค้าของโครงการ || Punchlist · project customer issues || Punchlist・プロジェクトの顧客課題',
    'my-work': 'My Work · Task inbox สำหรับงานที่ผ่านขั้นอนุมัติแผน || My Work · Task inbox for governed work || My Work・計画承認対象業務のTask inbox',
    'my-work-schedule': 'My Work · Project schedule tasks แยกจาก Task inbox || My Work · project schedule tasks, separate from Task inbox || My Work・Task inboxとは別のProject schedule tasks',
    'site-visits': 'Site Visit · คำขอ นัดหมาย และขั้นตอนเข้าหน้างาน || Site Visit · requests, appointments and visit stages || Site Visit・申請、日程、現地業務の工程',
    'assignments': 'My Assignments · งานเข้าหน้างานของบัญชีปัจจุบัน || My Assignments · site work assigned to this account || My Assignments・このアカウントの現地業務',
    'pricing': 'Price Library · ค้นหาราคาจากข้อมูลอ้างอิง || Price Library · search reference prices || Price Library・参考価格の検索',
    'quotations': 'Supplier Quotation · ทะเบียนใบเสนอราคาผู้ขาย || Supplier Quotation · supplier quotation register || Supplier Quotation・仕入先見積書台帳',
    'waiting-price': 'Waiting Supplier Price · ติดตามราคาที่ต้องตรวจต้นทาง || Waiting Supplier Price · source prices requiring follow-up || Waiting Supplier Price・確認が必要な元価格',
    'timeline': 'Project Timeline · ดูช่วงแผนและความคืบหน้าข้ามโครงการ || Project Timeline · schedules and progress across projects || Project Timeline・複数プロジェクトの期間と進捗',
    'resources': 'Resource Plan · Tasks และทางไปตรวจภาระงาน || Resource Plan · tasks and workload navigation || Resource Plan・Taskと負荷確認への移動',
    'procurement': 'Procurement Dashboard · ภาพรวมและคิววัสดุ || Procurement Dashboard · material overview and queue || Procurement Dashboard・資材概要と処理待ち',
    'bom': 'BOM · รายการวัสดุที่อ้างอิง Estimate ของโครงการ || BOM · material lists linked to project estimates || BOM・プロジェクト見積に紐づく資材表',
    'pr': 'Purchase Requisitions · PR ปัจจุบันและพื้นที่ PR ย้อนหลัง || Purchase Requisitions · current PRs and historical PR area || Purchase Requisitions・現行PRと過去PR領域',
    'po': 'Purchase Orders · ยอดสั่งซื้อและจำนวนคงค้าง || Purchase Orders · order values and outstanding quantities || Purchase Orders・発注額と未入庫数量',
    'inventory': 'Inventory · Stock Balances และแท็บ Adjustments & Quarantine || Inventory · stock balances and adjustment/quarantine tab || Inventory・残高と調整・隔離品タブ',
    'receiving': 'Goods Receiving · ค้นหา GRN และตรวจสถานะรับของ || Goods Receiving · find GRNs and receipt status || Goods Receiving・GRN検索と入庫状態',
    'issues': 'Material Issues · คำขอเบิกและสถานะการส่งมอบ || Material Issues · issue requests and handover status || Material Issues・払出申請と受渡し状態',
    'signing': 'Sign Inbox · งานถึงขั้นลงนาม งานถูกส่งกลับ และงานรอผู้อื่น || Sign Inbox · your signing steps, returned work and pending others || Sign Inbox・自分の署名工程、差し戻し、他者待ち',
    'reports': 'Reports · เลือกรายงาน 5 ประเภทและเปิดฉบับที่บันทึกไว้ || Reports · five report types and saved revisions || Reports・5種類の報告書と保存済み版',
    'report-templates': 'Team templates · เลือกโครงรายงานที่ใช้ซ้ำได้ || Team templates · reusable report structures || Team templates・再利用する報告書構成',
    'support': 'Support Center · ติดตามเรื่องที่แจ้งใน My tickets || Support Center · follow your reports in My tickets || Support Center・My ticketsで報告を追跡',
    'support-create': 'Report a problem · ฟอร์มแจ้งปัญหาจากหน้าที่ใช้งาน โดยยังไม่ได้ส่งเรื่อง || Report a problem · actual unsent form opened from the working screen || Report a problem・作業画面から開いた未送信の実フォーム',
    'knowledge': 'Knowledge Hub · Solutions & Sales Materials และทางไปคลังเอกสาร || Knowledge Hub · Solutions & Sales Materials and document libraries || Knowledge Hub・Solutions & Sales Materialsと文書ライブラリー',
    'master': 'Master Data · Customers และแท็บข้อมูลกลาง || Master Data · Customers and reference-data tabs || Master Data・Customersと共通マスタータブ',
    'module-templates': 'Module Templates · รายการโมดูลต้นทุนพร้อมนำกลับมาใช้ || Module Templates · reusable cost modules || Module Templates・再利用する原価Module',
    'stamps': 'Company Stamps · พื้นที่ทะเบียนตราและ Signature flows ตามสิทธิ์ || Company Stamps · stamp register and signature-flow access || Company Stamps・社印台帳と署名フローへのアクセス',
    'visit-master': 'Visit Master Data · ประเภทงานและการตั้งค่ากลางของการเข้าหน้างาน || Visit Master Data · visit types and shared site-work settings || Visit Master Data・訪問種類と現地業務の共通設定',
    'settings': 'Settings · สถานะบัญชี การเชื่อมต่อ และสิทธิ์แบบอ่านอย่างเดียว || Settings · read-only identity, connections and permissions || Settings・アカウント、接続、権限の閲覧専用情報',
    'analytics': 'Report analytics · Inventory Value และแท็บวิเคราะห์ทั้ง 4 || Report analytics · Inventory Value and four analytics tabs || Report analytics・Inventory Valueと4つの分析タブ',
    'performance': 'KPI framework · เกณฑ์และน้ำหนักการประเมิน โดยไม่เปิดคะแนนส่วนบุคคล || KPI framework · criteria and weights without individual ratings || KPI framework・個人点数を表示しない評価基準と比重',
}.items()}

UI = {lang: {} for lang in ['th', 'en', 'ja']}
for key, value in {
    'title': 'คู่มือปฏิบัติงานสำหรับพนักงาน || Employee operation manual || 従業員向け操作マニュアル',
    'edition': 'คู่มือฉบับ 2.0 · ภาพหน้าจอจริง · 3 ภาษา || Edition 2.0 · real screenshots · 3 languages || 第2.0版・実画面・3言語',
    'lead': 'เลือกหัวข้อจากงานที่กำลังทำ อ่านตามลำดับขั้น แล้วตรวจผลสำเร็จก่อนส่งงานต่อ ครอบคลุมพนักงาน หัวหน้าทีม จัดซื้อ คลัง และผู้ดูแลระบบ || Choose the topic for your current work, follow its steps, and check the result before handover. For employees, team leads, purchasing, warehouse and administrators. || 対象業務の章を選び、手順に沿って操作し、結果を確認してから引き継ぎます。従業員、責任者、購買、倉庫、管理者を対象としています。',
    'print': 'พิมพ์ทั้งเล่ม / PDF || Print all / PDF || 全章を印刷 / PDF',
    'toc': 'สารบัญ || Contents || 目次',
    'chapters': 'บท || chapters || 章',
    'chapter': 'บทที่ || Chapter || 第',
    'procedures': 'ขั้นตอนงาน || procedures || 操作手順',
    'screens': 'หน้าจอจริง × 3 ภาษา || real screens × 3 languages || 実画面 × 3言語',
    'date': 'เนื้อหาอ้างอิง 19 กันยายน 2569 || Content baseline: 19 September 2026 || 内容基準日：2026年9月19日',
    'offline': 'HTML ไฟล์เดียว · เปิดออฟไลน์ · พิมพ์ A4 || One HTML file · offline · A4 print || HTML 1ファイル・オフライン・A4印刷',
    'read': 'ภาษาเนื้อหาและภาพประกอบ || Content and screenshot language || 本文と画面画像の言語',
    'role': 'เริ่มตามหน้าที่ || Start by role || 役割から始める',
    'work': 'รับงานและอัปเดต || Accept and update work || 業務受諾・更新',
    'cost': 'ประเมินต้นทุน || Estimate costs || 原価見積',
    'trouble': 'แก้ปัญหาเบื้องต้น || Troubleshooting || 問題への対処',
    'search': 'ค้นหาในคู่มือ || Search this manual || マニュアルを検索',
    'placeholder': 'เช่น รับของ, revision, ลายเซ็น, PR ย้อนหลัง || e.g. receipt, revision, signature, historical PR || 例：入庫、改訂、署名、過去PR',
    'clear': 'ล้าง || Clear || クリア',
    'expand': 'ขยายขั้นตอน || Expand steps || 手順を展開',
    'collapse': 'ย่อขั้นตอน || Collapse steps || 手順を折りたたむ',
    'count': 'แสดง {shown} จาก {total} บท || Showing {shown} of {total} chapters || {total}章中{shown}章を表示',
    'empty': 'ไม่พบหัวข้อนี้ ลองใช้คำสั้นลง ชื่อเมนูภาษาอังกฤษ หรือกด “ล้าง” || No matching chapter. Try a shorter term, an English menu name, or Clear. || 該当する章がありません。短い語、英語のメニュー名、またはクリアを試してください。',
    'back': 'กลับด้านบน ↑ || Back to top ↑ || 上へ戻る ↑',
    'menu': 'เข้าเมนู || Menu || メニュー',
    'audience': 'ผู้ใช้งาน || For || 対象者',
    'image': 'ภาพหน้าจอจริง || Actual application screen || アプリの実画面',
    'zoom': 'กดรูปเพื่อขยาย || Select image to enlarge || 画像を選択して拡大',
    'close': 'ปิดภาพ || Close image || 画像を閉じる',
    'captured': 'บันทึกจาก Team Test · 6 ก.ย. 2569 || Captured in Team Test · 6 Sep 2026 || Team Testで撮影・2026年9月6日',
    'captureNote': 'ภาพมาจากหน้าเว็บจริงที่เปิดในบัญชีพนักงาน ข้อมูลและปุ่มขึ้นกับสิทธิ์และสถานะในวันบันทึกภาพ บางหน้ามีรายการว่างตามข้อมูลขณะนั้น ข้อความบางส่วนในตัวแอปอาจยังเป็นภาษาเดิม แม้เลือก EN หรือ JP แล้ว || These are actual screens from an employee account. Data and actions depend on permissions and capture-time state; some lists were empty. Some application strings may remain in their original language even after selecting EN or JP. || 従業員アカウントで開いた実画面です。情報・操作は撮影時の権限と状態によって異なり、空の一覧もあります。EN・JP選択後でも、アプリ内の一部文言は元言語のままの場合があります。',
    'useNote': 'เลือกภาษาได้ที่แถบด้านบน ภาพและคำอธิบายจะเปลี่ยนตาม กดรูปเพื่ออ่านขนาดใหญ่ ปุ่มพิมพ์จะเปิดครบทุกบทของภาษาที่เลือก แม้กำลังค้นหาหรือย่อขั้นตอนอยู่ || Choose a language above to change text and screenshots. Enlarge any image to read details. Print opens every chapter in the selected language, including filtered or collapsed content. || 上部の言語選択で本文と画像を切り替えます。画像は拡大して読めます。印刷時は検索・折りたたみ状態に関係なく、選択言語の全章を展開します。',
    'footer': 'คู่มือภายใน · ทบทวนเมื่อเปลี่ยนเมนู สิทธิ์ หรือขั้นตอนงาน · รูปฝังในไฟล์แล้ว ไม่ต้องต่ออินเทอร์เน็ตเพื่ออ่าน || Internal handbook · review when menus, permissions or workflows change · images are embedded for offline reading || 社内マニュアル・メニュー、権限、手順の変更時に見直し・画像内蔵のため閲覧にネット接続不要',
    'font': 'แบบอักษร Google Fonts: Noto Sans Thai / Noto Sans JP || Google Fonts: Noto Sans Thai / Noto Sans JP || Google Fonts：Noto Sans Thai / Noto Sans JP',
    'skip': 'ข้ามไปยังคู่มือ || Skip to manual || 本文へ移動',
    'noscript': 'กรุณาเปิด JavaScript เพื่อสลับภาษา ค้นหา และโหลดภาพฝังในคู่มือ สามารถอ่านเนื้อหาไทยด้านล่างได้โดยไม่เปิด JavaScript || Enable JavaScript to switch languages, search and load embedded screenshots. Thai text below remains readable without JavaScript. || 言語切替、検索、内蔵画像表示にはJavaScriptを有効にしてください。無効時も下のタイ語本文は読めます。',
}.items():
    for lang, text in triple(value).items():
        UI[lang][key] = text

EXTRA_CSS = r'''
:root{font-family:"Noto Sans Thai","Noto Sans JP","Segoe UI",Tahoma,sans-serif}
html[lang="ja"]{font-family:"Noto Sans JP","Noto Sans Thai","Segoe UI",sans-serif}
.top{flex-wrap:wrap}.top .edition{margin-left:auto}.language-switch{display:flex;gap:4px;border:1px solid #6e8ca5;border-radius:8px;padding:4px}.top .language-switch button{background:transparent;color:#e1edf8;padding:6px 11px;font-size:.85rem}.top .language-switch button[aria-pressed="true"]{background:#fff;color:#123c60;box-shadow:0 1px 5px #0002}.top .print-button{font-size:.82rem;padding:8px 12px}
html.embedded .top{display:none}html.embedded .layout{max-width:none;grid-template-columns:260px minmax(0,1fr)}html.embedded .sidebar{top:0;max-height:100vh;padding-top:20px}html.embedded main{max-width:1180px;padding-top:20px}html.embedded .intro{border-radius:8px}
.hero-screen{margin:24px 0 0}.hero-screen .screen-figure{margin-bottom:0}.guide-note{border-top:1px solid var(--line);padding-top:13px;font-size:.86rem;color:var(--muted)}.intro .use-note{font-size:.9rem;color:#315776}.screen-figure{margin:18px 0 24px;border:1px solid #c7d9e7;background:#f6f9fc;border-radius:8px;overflow:hidden;break-inside:avoid}.screen-button{display:block;width:100%;padding:0;border:0;background:#e8f1f8;cursor:zoom-in}.screen-button img{display:block;width:100%;height:auto;aspect-ratio:1905/1001;object-fit:contain;background:#eaf0f5}.screen-figure figcaption{padding:12px 15px;font-size:.85rem;line-height:1.7}.screen-figure figcaption strong{display:block;color:#214761}.screen-meta{display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap;margin-top:5px;color:#5a7182;font-size:.75rem}.screen-meta em{font-style:normal;color:#0958ad}.chapter-screens{margin:0 0 24px}.meta{grid-template-columns:minmax(70px,max-content) 1fr}.chapter-kicker{letter-spacing:.025em}
dialog{max-width:96vw;width:1600px;max-height:96vh;padding:0;border:1px solid #7c93a8;border-radius:10px;background:#f8fbfe;color:var(--ink);box-shadow:0 16px 100px #0007}dialog::backdrop{background:#081e35dd}.zoom-toolbar{position:sticky;top:0;display:flex;justify-content:space-between;align-items:center;gap:15px;padding:12px 16px;background:#fff;border-bottom:1px solid var(--line);z-index:1}.zoom-toolbar p{margin:0;font-size:.88rem}.zoom-toolbar button{white-space:nowrap;border:1px solid #bfd0de;border-radius:5px;padding:6px 13px;background:#edf4fa;color:var(--navy)}.zoom-image-wrap{overflow:auto;max-height:calc(96vh - 92px)}#zoom-image{display:block;width:100%;min-width:960px;height:auto}dialog .zoom-hint{font-size:.78rem;padding:8px 16px;margin:0;color:var(--muted)}
@media(max-width:1050px){.top .edition{display:none}.top{gap:10px}}
@media(max-width:760px){.top{padding:10px 14px}.brand{flex:1}.brand small{font-size:.63rem}.language-switch{order:3;width:100%;justify-content:center}.top .language-switch button{flex:1}.top .print-button{font-size:.75rem}.sidebar{padding-top:12px}html{scroll-padding-top:150px}.chapter{scroll-margin-top:150px}.intro{padding:20px}.meta{grid-template-columns:68px 1fr}.screen-figure figcaption{padding:10px}.screen-meta{display:block}.screen-meta em{display:block}.zoom-toolbar{align-items:flex-start}.zoom-toolbar p{font-size:.78rem}}
@media print{dialog,.screen-meta em,.guide-note,.use-note,.hero-screen{display:none!important}.screen-figure{border:1px solid #ccd5dd;background:#fff;margin:12px 0;break-inside:avoid}.screen-button{background:#fff}.screen-button img{max-height:108mm;object-fit:contain}.screen-figure figcaption{font-size:9pt;padding:7px 10px}.screen-meta{font-size:8pt}.chapter-screens{margin-bottom:14px}.meta{grid-template-columns:90px 1fr}.print-heading{display:block!important}}
'''

MANUAL_JS = r'''
(() => {
  'use strict';
  const pageParams = new URLSearchParams(location.search);
  document.documentElement.classList.toggle('embedded', pageParams.get('embedded') === '1');
  const data = JSON.parse(document.getElementById('manual-data').textContent);
  const $ = id => document.getElementById(id);
  const chapters = [...document.querySelectorAll('.chapter')];
  const search = $('search');
  const langButtons = [...document.querySelectorAll('[data-lang]')];
  let lang = 'th', index = [], beforeSearch = null, printing = null;
  const norm = value => value.normalize('NFKC').toLocaleLowerCase(lang).replace(/\s+/g, ' ').trim();
  const procedures = () => [...document.querySelectorAll('.procedure')];
  const text = key => data.ui[lang][key];
  function figure(key, eager = false) {
    const f = document.createElement('figure'); f.className = 'screen-figure';
    const button = document.createElement('button'); button.type = 'button'; button.className = 'screen-button';
    const caption = data.captions[key][lang];
    button.setAttribute('aria-label', text('zoom') + ': ' + caption);
    const img = document.createElement('img'); img.src = data.images[key][lang]; img.alt = caption;
    img.loading = eager ? 'eager' : 'lazy'; img.decoding = 'async'; img.width = 1905; img.height = 1001;
    button.append(img);
    button.addEventListener('click', () => {
      $('zoom-image').src = img.src; $('zoom-image').alt = caption;
      $('zoom-caption').textContent = caption; $('image-dialog').showModal();
    });
    const cap = document.createElement('figcaption'); const title = document.createElement('strong'); title.textContent = caption;
    const meta = document.createElement('div'); meta.className = 'screen-meta';
    const info = document.createElement('span'); info.textContent = text('captured') + ' · ' + (lang === 'ja' ? 'JP' : lang.toUpperCase());
    const hint = document.createElement('em'); hint.textContent = text('zoom');
    meta.append(info, hint); cap.append(title, meta); f.append(button, cap); return f;
  }
  function filter() {
    const terms = norm(search.value).split(' ').filter(Boolean);
    const items = procedures();
    if (terms.length && beforeSearch === null) beforeSearch = items.map(p => p.open);
    let shown = 0;
    index.forEach(({chapter, content}, i) => {
      const match = terms.every(t => content.includes(t));
      chapter.hidden = !match; $('toc-' + chapter.id).hidden = !match;
      if (match) shown++;
    });
    if (terms.length) items.forEach(p => {p.open = true;});
    else if (beforeSearch !== null) { items.forEach((p,i) => {p.open = beforeSearch[i] ?? true;}); beforeSearch = null; }
    $('result-count').textContent = text('count').replace('{shown}', shown).replace('{total}', chapters.length);
    $('no-results').hidden = shown !== 0;
  }
  function render(next) {
    if (!data.locales[next]) next = 'th';
    const open = beforeSearch || procedures().map(p => p.open);
    lang = next; beforeSearch = null; document.documentElement.lang = lang;
    document.title = text('title') + ' | TOMAS TECH · IoT Team Center';
    document.querySelectorAll('[data-copy]').forEach(el => {el.textContent = text(el.dataset.copy);});
    search.placeholder = text('placeholder'); $('language-switch').setAttribute('aria-label', text('read'));
    $('toc').setAttribute('aria-label', text('toc')); $('search-panel').setAttribute('aria-label', text('search'));
    langButtons.forEach(b => {b.setAttribute('aria-pressed', String(b.dataset.lang === lang));});
    chapters.forEach((chapter, i) => {
      const c = data.locales[lang][i];
      $('heading-' + c.id).textContent = c.title;
      chapter.querySelector('.chapter-number').textContent = lang === 'ja' ? '第 ' + String(i+1).padStart(2,'0') + ' 章' : text('chapter') + ' ' + String(i+1).padStart(2,'0');
      chapter.querySelector('.menu-value').textContent = c.menu;
      chapter.querySelector('.audience-value').textContent = c.audience;
      chapter.querySelector('.chapter-body').innerHTML = c.body;
      $('toc-' + c.id).querySelector('.toc-title').textContent = c.title;
      const pictures = chapter.querySelector('.chapter-screens'); pictures.replaceChildren();
      (data.figures[c.id] || []).forEach(key => pictures.append(figure(key)));
      pictures.hidden = !(data.figures[c.id] || []).length;
    });
    procedures().forEach((p,i) => {p.open = open[i] ?? true;});
    $('hero-screen').replaceChildren(figure('dashboard', true));
    index = chapters.map(chapter => ({chapter, content:norm(chapter.textContent)}));
    filter();
    try {localStorage.setItem('iot-employee-manual-language', lang);} catch (_) { /* file/private mode */ }
  }
  function revealHash() {
    const id = decodeURIComponent(location.hash.slice(1));
    const target = document.getElementById(id);
    if (!target || !target.classList.contains('chapter')) return;
    if (target.hidden) {search.value = ''; filter();}
    document.querySelectorAll('.toc a').forEach(a => a.classList.toggle('active', a.hash === '#' + id));
    target.scrollIntoView({block:'start', behavior:'auto'});
  }
  function preparePrint() {
    if (printing) return;
    printing = {open:procedures().map(p => p.open), hidden:chapters.map(c => c.hidden), y:scrollY};
    chapters.forEach(c => {c.hidden = false;}); procedures().forEach(p => {p.open = true;});
    document.querySelectorAll('.screen-figure img').forEach(img => {img.loading = 'eager';});
  }
  function restorePrint() {
    if (!printing) return;
    const saved = printing; printing = null;
    procedures().forEach((p,i) => {p.open = saved.open[i];}); chapters.forEach((c,i) => {c.hidden = saved.hidden[i];});
    window.scrollTo({top:saved.y, behavior:'auto'});
  }
  langButtons.forEach(button => button.addEventListener('click', () => render(button.dataset.lang)));
  search.addEventListener('input', filter);
  $('clear-search').addEventListener('click', () => {search.value = ''; filter(); search.focus();});
  $('expand').addEventListener('click', () => {procedures().forEach(p => {p.open = true;}); if(beforeSearch) beforeSearch.fill(true);});
  $('collapse').addEventListener('click', () => {procedures().forEach(p => {p.open = false;}); if(beforeSearch) beforeSearch.fill(false);});
  $('close-image').addEventListener('click', () => $('image-dialog').close());
  $('image-dialog').addEventListener('click', event => {if(event.target === $('image-dialog')) $('image-dialog').close();});
  $('image-dialog').addEventListener('close', () => {$('zoom-image').removeAttribute('src');});
  $('print').addEventListener('click', async () => {
    preparePrint();
    await Promise.all([...document.querySelectorAll('.screen-figure img')].map(img => img.decode().catch(() => {})));
    window.print();
  });
  window.addEventListener('beforeprint', preparePrint); window.addEventListener('afterprint', restorePrint);
  window.addEventListener('hashchange', revealHash);
  document.querySelectorAll('.toc a, .quicklinks a').forEach(a => a.addEventListener('click', () => {
    const target = document.getElementById(a.hash.slice(1));
    if (target?.hidden) {search.value = ''; filter();}
  }));
  if (window.matchMedia('(max-width:760px)').matches) document.querySelector('.toc-box').open = false;
  const requestedLanguage = pageParams.get('lang');
  let stored = ['th','en','ja'].includes(requestedLanguage) ? requestedLanguage : 'th';
  if (!requestedLanguage) try {stored = localStorage.getItem('iot-employee-manual-language') || 'th';} catch (_) {}
  render(stored); if (location.hash) requestAnimationFrame(revealHash);
})();
'''


def build_illustrated(chapters, base_css):
    font_css = FONT_DIR.joinpath('embedded-fonts.css').read_text(encoding='utf-8-sig')
    for font_file in sorted(FONT_DIR.glob('*-manual-*.woff2')):
        font_data = base64.b64encode(font_file.read_bytes()).decode('ascii')
        font_css = font_css.replace("url('" + font_file.name + "')", "url('data:font/woff2;base64," + font_data + "')")
    if re.search(r"url\('[^']+\.woff2'\)", font_css):
        raise ValueError('A Google font subset was not embedded')
    font_licenses = '\n\n'.join(FONT_DIR.joinpath(name).read_text(encoding='utf-8') for name in ['OFL-NotoSansThai.txt', 'OFL-NotoSansJP.txt'])
    locales = {'th': chapters}
    for lang in ['en', 'ja']:
        if set(LOCALES[lang]) != {c['id'] for c in chapters}:
            raise ValueError('Missing translated chapters: ' + lang)
        locales[lang] = [LOCALES[lang][c['id']] for c in chapters]
        for original, translated in zip(chapters, locales[lang]):
            if re.findall(r'<summary>([\d.]+)', original['body']) != re.findall(r'<summary>([\d.]+)', translated['body']):
                raise ValueError('Procedure coverage mismatch: ' + translated['id'])
            if re.search(r'[\u0e00-\u0e7f]', translated['title'] + translated['body']):
                raise ValueError('Untranslated Thai content: ' + lang + ' ' + translated['id'])
    chapter_count = len(chapters)
    procedure_count = sum(len(re.findall(r'<details class="procedure"', chapter['body'])) for chapter in chapters)
    keys = sorted({key for values in FIGURES.values() for key in values})
    images, manifest = {}, []
    for key in keys:
        images[key] = {}
        for lang, suffix in [('th', 'th'), ('en', 'en'), ('ja', 'jp')]:
            path = SHOT_DIR / f'{key}-{suffix}.jpg'
            content = path.read_bytes()
            if not content.startswith(b'\xff\xd8\xff'):
                raise ValueError('Invalid screenshot: ' + str(path))
            images[key][lang] = 'data:image/jpeg;base64,' + base64.b64encode(content).decode('ascii')
            manifest.append(dict(key=key, language=lang, file=path.name, caption=CAPTIONS[key][lang], sha256=hashlib.sha256(content).hexdigest(), bytes=len(content)))
    SHOT_DIR.joinpath('manifest.json').write_text(json.dumps(dict(
        source='http://192.168.1.160:3000/', environment='Team Test', capturedDate='2026-09-06',
        method='Real Chrome UI screenshots via Computer Use; JPEG bytes unaltered.',
        scope='Employee account; no transactions submitted for capture. Empty lists reflect capture-time data. Some source application strings are not localized.',
        excluded=['signed-documents: loading error captured; not embedded in the handbook'],
        captures=manifest), ensure_ascii=False, indent=2), encoding='utf-8')
    minimal = {lang: [{k:c[k] for k in ['id', 'title', 'menu', 'audience', 'body']} for c in cc] for lang, cc in locales.items()}
    payload = json.dumps(dict(locales=minimal, images=images, figures=FIGURES, captions=CAPTIONS, ui=UI), ensure_ascii=False, separators=(',', ':')).replace('<', '\\u003c').replace('\u2028', '\\u2028').replace('\u2029', '\\u2029')
    ui = UI['th']

    def copy(key, tag='span', attrs=''):
        return f'<{tag} data-copy="{key}" {attrs}>{escape(ui[key])}</{tag}>'

    toc = ''.join(f'<a id="toc-{c["id"]}" href="#{c["id"]}"><span>{i:02d}</span><b class="toc-title" style="font-weight:inherit">{escape(c["title"])}</b></a>' for i, c in enumerate(chapters, 1))
    body = ''.join(f'''<section class="chapter" id="{c['id']}" aria-labelledby="heading-{c['id']}"><header class="chapter-head"><div class="chapter-kicker"><span class="chapter-number">บทที่ {i:02d}</span>{copy('back','a','href="#top"')}</div><h2 id="heading-{c['id']}">{escape(c['title'])}</h2><dl class="meta">{copy('menu','dt')}<dd class="menu-value">{escape(c['menu'])}</dd>{copy('audience','dt')}<dd class="audience-value">{escape(c['audience'])}</dd></dl></header><div class="chapter-screens" hidden></div><div class="chapter-body">{c['body']}</div></section>''' for i, c in enumerate(chapters, 1))
    page = f'''<!doctype html>
<html lang="th"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="description" content="IoT Team Center employee manual: {chapter_count} chapters, {procedure_count} procedures, real screenshots, Thai / English / Japanese, offline HTML."><title>{escape(ui['title'])} | TOMAS TECH · IoT Team Center</title><style>{base_css}{font_css}{EXTRA_CSS}</style></head>
<body id="top">{copy('skip','a','class="skip" href="#manual"')}
<header class="top"><div class="brand">TOMAS TECH<small>IoT TEAM CENTER / EMPLOYEE GUIDE</small></div>{copy('edition','span','class="edition"')}<div id="language-switch" class="language-switch" role="group" aria-label="{ui['read']}"><button type="button" data-lang="th" lang="th" aria-pressed="true">ไทย</button><button type="button" data-lang="ja" lang="ja" aria-pressed="false">日本語</button><button type="button" data-lang="en" lang="en" aria-pressed="false">English</button></div>{copy('print','button','type="button" id="print" class="print-button"')}</header>
<div class="layout"><aside class="sidebar"><details class="toc-box" open><summary>{copy('toc')} · {chapter_count}</summary><nav id="toc" class="toc" aria-label="{ui['toc']}">{toc}</nav></details><div class="sidebar-footer">TH / 日本語 / English<br>{copy('date')}<br>{copy('offline')}</div></aside>
<main id="manual"><section class="intro" aria-labelledby="manual-title"><p class="eyebrow">EMPLOYEE OPERATION MANUAL · 2.0</p><h1><span id="manual-title" data-copy="title">{escape(ui['title'])}</span><small>IoT Team Center</small></h1>{copy('lead','p')}<div class="pills"><span class="pill">{chapter_count} {copy('chapters')}</span><span class="pill">{procedure_count} {copy('procedures')}</span><span class="pill">{len(keys)} {copy('screens')}</span><span class="pill">{copy('offline')}</span></div><div class="quicklinks">{copy('role','a','href="#daily"')}{copy('work','a','href="#my-work"')}{copy('cost','a','href="#estimate"')}{copy('trouble','a','href="#troubleshooting"')}</div>{copy('useNote','p','class="use-note"')}<div id="hero-screen" class="hero-screen"></div>{copy('captureNote','p','class="guide-note"')}</section>
<noscript><p>{escape(ui['noscript'])}<br>{escape(UI['en']['noscript'])}<br>{escape(UI['ja']['noscript'])}</p></noscript>
<section class="search-panel" id="search-panel" aria-label="{ui['search']}">{copy('search','label','for="search"')}<div class="search-line"><input id="search" type="search" placeholder="{ui['placeholder']}" autocomplete="off" aria-describedby="result-count">{copy('clear','button','type="button" id="clear-search"')}</div><div class="tools">{copy('expand','button','type="button" id="expand"')}{copy('collapse','button','type="button" id="collapse"')}<output id="result-count" aria-live="polite"></output></div></section>
{copy('empty','p','id="no-results" hidden')}<p class="print-heading">TOMAS TECH · IoT Team Center · {copy('title')} · 2.0 · {copy('date')}</p>
{body}<footer class="footer">{copy('back','a','href="#top"')}<b>TOMAS TECH · IoT Team Center</b><br>{copy('edition')}<br>{copy('date')}<br>{copy('font')}<br>{copy('footer')}</footer></main></div>
<dialog id="image-dialog" aria-labelledby="zoom-caption"><div class="zoom-toolbar"><p id="zoom-caption"></p>{copy('close','button','type="button" id="close-image"')}</div><div class="zoom-image-wrap"><img id="zoom-image" alt=""></div>{copy('captured','p','class="zoom-hint"')}</dialog>
<script type="application/json" id="manual-data">{payload}</script><script type="text/plain" id="font-license" hidden>{escape(font_licenses)}</script><script>{MANUAL_JS}</script></body></html>'''
    return page, len(keys), len(manifest)
