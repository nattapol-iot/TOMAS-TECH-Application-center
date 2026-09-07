"""Reviewed English/Japanese employee instructions, paired for coverage parity.

Each string is English || Japanese. Product menu names stay recognizable.
No translation services or runtime network requests are used.
"""
from html import escape

LOCALES = {'en': {}, 'ja': {}}


class Pair:
    def __init__(self, en='', ja=''):
        self.en, self.ja = en, ja

    def __add__(self, other):
        return Pair(self.en + other.en, self.ja + other.ja)


def pair(text):
    parts = text.split('||')
    if len(parts) != 2:
        raise ValueError('Expected English || Japanese: ' + text[:80])
    return Pair(*[s.strip() for s in parts])


def H(text):
    return pair(text)


def N(text):
    p = pair(text)
    return Pair('<aside class="note"><strong>Good to know</strong><p>' + p.en + '</p></aside>', '<aside class="note"><strong>補足</strong><p>' + p.ja + '</p></aside>')


def P(title, steps, result, extra=''):
    t, r = pair(title), pair(result)
    s = [pair(x) for x in steps]
    out = Pair()
    for lang, label in [('en', 'Check the result'), ('ja', '完了の確認')]:
        body = '<details class="procedure" open><summary>' + getattr(t, lang) + '</summary><div class="procedure-body"><ol>' + ''.join('<li>' + getattr(x, lang) + '</li>' for x in s) + '</ol><p class="result"><strong>' + label + '</strong> ' + getattr(r, lang) + '</p>'
        if extra:
            body += getattr(N(extra), lang)
        setattr(out, lang, body + '</div></details>')
    return out


def T(headers, rows):
    hh, rr = [pair(x) for x in headers], [[pair(x) for x in row] for row in rows]
    out = Pair()
    for lang in LOCALES:
        setattr(out, lang, '<div class="table-scroll"><table><thead><tr>' + ''.join('<th scope="col">' + getattr(x, lang) + '</th>' for x in hh) + '</tr></thead><tbody>' + ''.join('<tr>' + ''.join('<td>' + getattr(x, lang) + '</td>' for x in row) + '</tr>' for row in rr) + '</tbody></table></div>')
    return out


def C(id, title, menu, audience, body):
    fields = {k: pair(v) for k, v in [('title', title), ('menu', menu), ('audience', audience)]}
    for lang in LOCALES:
        LOCALES[lang][id] = dict(id=id, **{k: getattr(v, lang) for k, v in fields.items()}, body=getattr(body, lang))


C('start', 'Getting started and permissions || 利用開始とアクセス権限', 'Sign-in → My Profile || ログイン → My Profile', 'All employees || 全従業員',
  P('1.1 Sign in for the first time || 1.1 初回ログイン', [
    'Open the URL provided by your administrator. Check <b>TEAM TEST</b> or <b>PRODUCTION</b> before working. || 管理者から案内されたURLを開き、作業先が <b>TEAM TEST</b> または <b>PRODUCTION</b> のどちらか確認します。',
    'In Team Test, enter your Registered email and individual Personal test access code. In Production, sign in with your company Microsoft account. || Team Testでは登録メールと個人用テストアクセスコードを入力します。Productionでは会社のMicrosoftアカウントでログインします。',
    'Wait for Dashboard, then check your name, department and role in the user area. || Dashboardの表示後、ユーザー欄で氏名・部署・役割を確認します。',
    'Select <b>TH / EN / JP</b> in the top bar for your preferred interface language. || 上部の <b>TH / EN / JP</b> から表示言語を選択します。'
  ], 'Your own identity and permitted menus appear without a sign-in error. || 自分の情報と利用可能なメニューが表示され、ログインエラーがないことを確認します。',
    'The content baseline is 6 September 2026. Available functions depend on the installed release, permissions and project membership. || 内容の基準日は2026年9月6日です。利用可能な機能は導入版、権限、プロジェクトへの所属によって異なります。') +
  P('1.2 Check your profile and sign out || 1.2 プロフィール確認とログアウト', [
    'Open your user menu → <b>My Profile</b>. Check employee ID, email, department, position and permissions. || ユーザーメニュー → <b>My Profile</b> で社員番号、メール、部署、役職、権限を確認します。',
    'You can also change language in Profile. Ask the administrator to correct company-managed fields such as your name or role. || Profileからも言語を変更できます。氏名や役割など会社管理の情報に誤りがあれば管理者へ連絡します。',
    'Use <b>Manage signature</b> for your signature or <b>Open My Work</b> to open assigned work. || <b>Manage signature</b> で署名を管理し、<b>Open My Work</b> で担当業務を開きます。',
    'Save unfinished work before <b>Logout / Sign out</b>, particularly on a shared computer. || 特に共用PCでは、未保存の作業を保存してから <b>Logout / Sign out</b> を選択します。'
  ], 'The selected language is active, or the sign-in page appears after sign-out. || 選択言語への切替、またはログアウト後のログイン画面を確認します。') +
  T(['Permission || 権限', 'Meaning || 意味'], [
    ['Read || 閲覧', 'View records in your scope; this does not grant editing or approval. || 自分の範囲の情報を閲覧できます。編集・承認権限とは別です。'],
    ['Write / Request || 編集・申請', 'Create or edit records allowed by ownership and workflow state. || 担当者と状態に応じて許可された作成・編集を行えます。'],
    ['Review / Approve || レビュー・承認', 'Act only at the authorized step; some documents name individual approvers. || 権限のある工程だけを処理します。承認者が個別指定される書類もあります。'],
    ['Admin || 管理者', 'Admin access does not automatically permit signing for others or using company stamps. || 管理者でも他人の代理署名や社印使用が自動的に許可されるわけではありません。']
  ]))

C('navigation', 'Menus, search and notifications || メニュー・検索・通知', 'Left navigation / top bar || 左メニュー・上部バー', 'All employees || 全従業員',
  P('2.1 Find a document or task || 2.1 書類や業務を探す', [
    'Select a module such as Inquiry, Estimate Cost or Projects. Click a collapsed group heading to expand it. || Inquiry、Estimate Cost、Projectsなどのモジュールを選びます。閉じたグループは見出しを押して展開します。',
    'Search within that module using the document number, customer, job name or item code supported by its search box. || その画面の検索欄に対応する書類番号、顧客名、案件名、品目コードなどで検索します。',
    'Apply available status, customer, owner or date filters. Change rows per page and use the next page when needed. || 状態・顧客・担当・日付などのフィルターを使い、必要に応じて表示件数やページを切り替えます。',
    'If nothing appears, clear search and filters, then select <b>Refresh</b>. || 見つからない場合は検索とフィルターを解除し、<b>Refresh</b> を押します。'
  ], 'Confirm the document number and customer before opening or editing. || 開く・編集する前に番号と顧客が一致することを確認します。',
    'Missing records may be outside your permission or project scope. Do not create a duplicate simply because a search returns nothing. || 権限や所属プロジェクトにより表示されない場合があります。検索結果がないだけで重複登録しないでください。') +
  P('2.2 Read notifications and save reliably || 2.2 通知確認と確実な保存', [
    'Open the bell, review unread notifications and follow an entry to its source task. || ベルを開いて未読通知を確認し、該当業務へ移動します。',
    'Use <b>Mark all as read</b> after reading. Reading is separate from accepting work or approving a document. || 確認後に <b>Mark all as read</b> を使います。既読化は業務の受諾や書類承認ではありません。',
    'Use Save or the page action after editing; wait for success before leaving. || 編集後はSaveまたは実行ボタンを押し、成功表示を待ってから移動します。',
    'If someone else has updated the record, keep a copy of unsaved text, reload the latest version and reconcile the differences before editing again. || 他の人による更新が通知された場合、未保存の文面を控え、最新版を読み直して差分を確認してから編集します。'
  ], 'Reopening shows your saved data and the state resulting from the actual action. || 再度開いて保存内容と処理後の状態を確認します。') +
  P('2.3 Open and search the manual inside the app || 2.3 アプリ内でマニュアルを開いて検索', [
    'Select Employee Manual in the left navigation, or open it from the user menu at the top right. || 左メニューの操作マニュアル、または右上のユーザーメニューから開きます。',
    'The embedded manual follows the TH / EN / JP language selected in the top bar. Use the contents or search to find a menu, task or document. || 内蔵マニュアルは上部バーのTH / EN / JPに合わせて表示されます。目次または検索からメニュー、業務、書類を探します。',
    'Select a screenshot to enlarge it, and use Open full screen when you need more reading space. || 画面画像は選択して拡大でき、広い表示が必要な場合は全画面で開きます。',
    'Use Download manual to keep the single HTML file for offline reading, or use the manual print action to create a PDF. || マニュアルを保存でHTML 1ファイルをオフライン用に保存するか、印刷機能からPDFを作成します。'
  ], 'You can open the required chapter in the app, its language matches the app, and the downloaded file works offline. || アプリ内で必要な章を開け、表示言語がアプリと一致し、保存したファイルをオフラインで閲覧できます。'))

C('daily', 'Daily work by role || 役割別の日常業務', 'Dashboard → relevant task || Dashboard → 対象業務', 'Employees, team leads and support staff || 従業員・チームリーダー・支援担当',
  H('<p>Choose a starting chapter by role. One account may cover several responsibilities.</p> || <p>役割に応じて最初に読む章を選びます。1つのアカウントが複数の業務を担当する場合もあります。</p>') +
  T(['Role || 役割', 'Start of day || 始業時', 'During work and before handover || 作業中・引継ぎ前'], [
    ['Sales / customer coordinator || 営業・顧客窓口', '<a href="#inquiry">Check Inquiry and deadlines</a> || <a href="#inquiry">Inquiryと期限を確認</a>', 'Meeting Log → requirements → visit or estimate → follow-up and handover. || Meeting Log → 要件 → 現地訪問または原価見積 → 追跡・引継ぎ。'],
    ['Engineer / assignee || エンジニア・担当者', '<a href="#my-work">Task inbox</a> and <a href="#assignments">My Assignments</a> || <a href="#my-work">Task inbox</a> と <a href="#assignments">My Assignments</a>', 'Accept work → update progress and actual dates → report problems/replan → submit reports/drawings → await verification. || 受諾 → 進捗・実績日更新 → 問題報告・計画変更 → 報告書・図面提出 → 検収。'],
    ['PM / Planner / engineering lead || PM・計画担当・技術責任者', '<a href="#resources">Check workload</a> and approval queues || <a href="#resources">負荷</a> と承認待ちを確認', 'Approve plans, resolve bottlenecks, review costs/reports/drawings and verify Tasks/Punchlist. || 計画承認、障害解消、原価・報告書・図面の確認、Task・Punchlistの検収。'],
    ['Purchasing || 購買', '<a href="#procurement">Procurement queue</a> || <a href="#procurement">購買処理待ち</a>', 'BOM and stock → PR → approval → PO → delivery follow-up. || BOM・在庫 → PR → 承認 → PO → 納期追跡。'],
    ['Store / Inventory Controller || 倉庫・在庫管理', '<a href="#receiving">Receipts</a> and <a href="#issues">issues</a> || <a href="#receiving">入庫</a> と <a href="#issues">出庫</a>', 'GRN → confirm receipt → issue material → returns, stock checks and quarantine decisions. || GRN → 入庫確定 → 資材出庫 → 返品・棚卸・隔離品処理。'],
    ['Document owner / signer || 書類担当・署名者', '<a href="#signing">Sign Inbox</a> || <a href="#signing">Sign Inbox</a>', 'Read the file/revision, review or sign your step, and return with reasons when needed. || ファイル・版を確認し、自分の工程でレビュー・署名。必要なら理由付きで差し戻し。'],
    ['Admin / Support category owner || 管理者・Support分類担当', '<a href="#support">Support queue</a> || <a href="#support">Support処理待ち</a>', 'Take and reply to tickets, maintain assigned master data/permissions, record reasons and follow through to closure. || 受付・回答、担当範囲のマスター・権限管理、理由記録、完了まで追跡。']
  ]) + H('<div class="flow"><span>Inquiry</span><b>→</b><span>Visit / Estimate</span><b>→</b><span>Project &amp; Plan</span><b>→</b><span>Purchase / Execute</span><b>→</b><span>Report / Handover</span></div> || <div class="flow"><span>Inquiry</span><b>→</b><span>現地訪問・原価見積</span><b>→</b><span>プロジェクト・計画</span><b>→</b><span>購買・作業</span><b>→</b><span>報告・引渡し</span></div>') +
  N('Cost data is internal. Share estimate exports and cost reports only with appropriate recipients; these figures are not selling prices or profit. || 原価は社内情報です。見積原価の出力や原価報告は適切な相手に共有してください。販売価格や利益を示すものではありません。'))

C('dashboard', 'Dashboard: overview and follow-up || Dashboard：概要とフォロー', 'Dashboard || Dashboard', 'Signed-in users || ログイン済みユーザー',
  P('4.1 Choose your next action || 4.1 次の業務を選ぶ', [
    'Open Dashboard and wait for the current data to load. Check the account and period shown. || Dashboardを開いて読込完了を待ち、表示アカウントと期間を確認します。',
    'Review personal work, due or overdue tasks and the available overview cards. Use the figures to identify priorities. || 自分の業務、期限・遅延業務、概要カードを確認して優先順位を決めます。',
    'Follow a task or shortcut to its source module and verify the record before acting. || 業務やショートカットから元のモジュールへ進み、対象レコードを確認して処理します。',
    'Refresh after changes. If a section fails to load, retry or report the problem before relying on its totals. || 更新後は再読込します。一部が読み込めない場合は再試行または問題報告を行い、未取得の集計で判断しないでください。'
  ], 'You know the next task and can trace it to its source record. || 次に行う業務と元のレコードが明確になります。',
    'Cards vary by role, release and accessible records. A zero or empty display during loading does not prove that no work exists. || カードは役割・導入版・閲覧可能なデータで異なります。読込中のゼロや空欄だけで業務がないと判断しないでください。'))

C('customers', 'Customers, contacts and end users || 顧客・連絡先・エンドユーザー', 'Inquiry → New inquiry / Master Data → Customers || Inquiry → New inquiry / Master Data → Customers', 'Sales / customer data owners || 営業・顧客マスター担当',
  P('5.1 Select a customer and add a contact || 5.1 顧客選択と連絡先追加', [
    'In New inquiry, search existing companies first and check both name and code. || New inquiryで既存会社を先に検索し、名称とコードを確認します。',
    'If absent, select New customer and enter the company name; enter a code or use automatic numbering as offered. || 未登録ならNew customerで会社名を入力し、コードを指定するか画面の自動採番を使います。',
    'Enter company/contact names in Thai, English and Japanese only when the actual names are known, including available title fields. Do not invent translations of names. || 会社・連絡先のタイ語、英語、日本語名は正式情報がある言語だけ入力し、敬称欄も使用します。名前を推測翻訳しないでください。',
    'A contact name is required when entering email, phone, position or department. For an existing company, select a saved contact or add one under the correct Main office / Site. || メール・電話・役職・部署を入力する場合は本人名も必要です。既存会社では登録済み連絡先を選ぶか、正しい本社・拠点に追加します。',
    'Save the contact and select it back into the inquiry. || 連絡先を保存し、Inquiryに戻って選択します。'
  ], 'The selected company/contact appears and your unfinished inquiry data remains. || 会社・連絡先が反映され、入力中のInquiry情報が保持されます。',
    'Position and department belong to each contact. Similar company names are not automatically merged; check spelling before creating one. || 役職と部署は連絡先ごとの情報です。類似会社名は自動統合されないため、新規登録前に表記を確認します。') +
  P('5.2 Distinguish contracting customer and end user || 5.2 契約顧客とエンドユーザーを区別', [
    'Select the Contracting customer as the contractual customer or company placing the work. || Contracting customerには契約相手または発注元を選びます。',
    'Select the End user when the actual operating company is known; otherwise leave it unspecified. || 実際の利用会社が分かる場合にEnd userを選び、不明なら未指定のままにします。',
    'Use the End user company-add form if needed. A company-only form does not require personal contact fields. || 必要ならEnd userの会社追加フォームを使用します。会社専用フォームでは個人連絡先は不要です。',
    'Check the inherited end user when creating a Project. Later, use Edit End user where the record remains editable. || Project作成時にInquiryから引き継いだEnd userを確認します。後で変更する場合は編集可能なレコードでEdit End userを使用します。'
  ], 'The two companies are correct and new reports reference the chosen source. || 2つの会社が正しく区別され、新規報告書が選択した元案件を参照します。',
    'Changing current company data does not rewrite text or evidence in already approved report revisions. || 現在の会社情報を変更しても、承認済み報告書の旧版にある文章や証拠は書き換わりません。') +
  P('5.3 Read a business card image || 5.3 名刺画像から入力を補助', [
    'In a supported customer/contact form, select Choose business card image or Take photo. || 対応する顧客・連絡先フォームで名刺画像の選択または撮影を選びます。',
    'Use a clear, straight image with all text visible. Wait for image preparation and recognition. || 全文字が写った鮮明で正面向きの画像を使い、前処理と文字認識を待ちます。',
    'If several names are detected, select the correct company and person, then apply the suggested data. || 複数候補がある場合は会社と本人を選び、候補情報を適用します。',
    'Review every field, especially Japanese names, email, phone, position and address. Suggestions fill empty fields only. || 日本語名、メール、電話、役職、住所を含め全項目を確認します。候補は空欄だけに反映されます。',
    'Correct the fields and Save normally. If recognition fails, try another image or enter the data manually. || 内容を修正して通常どおり保存します。読取失敗時は別画像または手入力を使います。'
  ], 'The record is stored only after Save and your manual review. || 自分で確認してSaveを押した時点で登録されます。',
    'Recognition runs in the browser; it neither uploads the business card image nor automatically saves a customer. || 文字認識はブラウザー内で行われ、名刺画像のアップロードや顧客の自動保存は行いません。'))

C('inquiry', 'Inquiry: intake and requirements || Inquiry：案件受付と要件整理', 'Inquiry || Inquiry', 'Sales / estimate owners / authorized users || 営業・原価見積責任者・権限保有者',
  P('6.1 Create the customer inquiry || 6.1 顧客案件を登録', [
    'Open Inquiry → New inquiry. Find the customer and select the contact. || Inquiry → New inquiryで顧客と連絡先を選びます。',
    'Enter the job title, required main fields and estimate deadline; verify owner and priority. || 案件名、必須の基本項目、見積期限を入力し、担当者と優先度を確認します。',
    'Expand additional details for work type, RFQ reference, End user and other known information. || 追加情報を開き、業務種類、RFQ番号、End userなど分かっている情報を入力します。',
    'Describe requirements and scope for engineering, create the record, then note its Inquiry number and open the details. || 技術部門に伝わる要件・範囲を記載して作成し、Inquiry番号を控えて詳細を開きます。'
  ], 'The inquiry has a number and the correct customer, job and owner. || 採番され、顧客・案件・担当者が正しいことを確認します。') +
  P('6.2 Keep requirements, meeting logs and attachments || 6.2 要件・議事録・添付資料を整理', [
    'Read Overview for the owner and initial information. || Overviewで担当者と登録時の情報を確認します。',
    'Requirement displays the recorded problem, scope, technical needs, site, standards and constraints. Add new information through Meeting Log/attachments and coordinate with the owner. || Requirementで課題、範囲、技術要件、場所、規格、制約を読みます。追加情報はMeeting Log・添付資料に記録し、担当者と調整します。',
    'In Meeting Log, record date, meeting format, attendees, agreements, open questions and actions with owners and due dates. || Meeting Logに日付、会議形式、出席者、合意、未決事項、担当者・期限付きアクションを記録します。',
    'In Attachments, choose a document category and upload RFQ, specifications, drawings or layouts. Check that downloads work. || Attachmentsで分類を選び、RFQ・仕様書・図面・レイアウトなどをアップロードし、ダウンロードを確認します。',
    'Use Activity to inspect the change history. || Activityで変更履歴を確認します。'
  ], 'A colleague can understand the scope, agreements and remaining work from this inquiry. || 同じInquiryから他の担当者が範囲・合意・残作業を理解できます。') +
  P('6.3 Continue to a visit or estimate || 6.3 現地訪問・原価見積へ進む', [
    'When ready to estimate, use Create estimate or the Estimate Cost tab. || 見積可能ならCreate estimateまたはEstimate Costタブを使います。',
    'When a site survey is needed, use Request site visit or the visits/results tab. || 現地調査が必要なら訪問申請ボタンまたは訪問・結果タブを使います。',
    'Track the request and survey through the same inquiry, then estimate from that source. || 同じInquiryで申請と調査結果を追跡し、その案件から見積を行います。',
    'If an estimate is already linked, open it, check its revision and use the revision workflow when changes require it. || 既存の見積がリンクされていれば版を確認し、必要な変更は改訂手順で行います。'
  ], 'Visits, survey results and the estimate remain linked to one inquiry. || 訪問申請・調査結果・原価見積が同じInquiryに紐づきます。',
    'Sales Intake is not a separate primary menu in this release. Legacy requests remain accessible under Site Visit → requests/data review. || この版ではSales Intakeは独立した主メニューではありません。旧申請はSite Visitの申請・情報確認から開けます。') +
  P('6.4 Change ownership and opportunity qualification || 6.4 担当者と案件確度を更新', [
    'Open the inquiry and use its owner/assignment action to select an authorized new owner. || Inquiryの担当者・割当操作を開き、選択可能な新担当者を指定します。',
    'Use Qualification to enter the opportunity grade, probability from 0 to 100 and a supporting note. || Qualificationで案件評価、0～100の確率、根拠メモを入力します。',
    'Save each action and recheck Overview and Activity. || 各操作を保存し、OverviewとActivityで確認します。'
  ], 'The owner and qualification reflect the agreed decision, with history. Probability and Customer Interest Grade are separate values. || 合意した担当者と確度が反映され、履歴が残ります。確率とCustomer Interest Gradeは別の値です。'))

C('visit-request', 'Site visit request and readiness || 現地訪問申請と準備確認', 'Inquiry → visits/results; Site Visit → requests/data review || Inquiry → 訪問・結果；Site Visit → 申請・情報確認', 'Sales / technical reviewers || 営業・技術審査担当',
  P('7.1 Prepare a request for technical review || 7.1 訪問申請を準備して技術審査へ', [
    'Start from Inquiry. Check copied customer, site, contact, requirements, owner, priority and response deadline. || Inquiryから開始し、引継いだ顧客、現場、連絡先、要件、担当、優先度、回答期限を確認します。',
    'Enter a site name and usable address plus a contact with phone or email. || 現場名、到着できる住所、電話またはメールのある連絡先を入力します。',
    'Describe the current problem and expected outcome with at least 20 characters in each field. Select at least one visit objective. || 現状の課題と期待する成果を各20文字以上で記載し、訪問目的を1つ以上選びます。',
    'Add machines, existing systems, required skills, customer availability, site access/PPE and available photos or drawings. || 機械、既存システム、必要スキル、顧客の希望日時、入場条件・保護具、写真・図面を追加します。',
    'Review Readiness and resolve all blockers. Save drafts while gathering information; submit for Technical Review when ready. || Readinessの必須不足を解消します。情報収集中は下書き保存し、準備完了後にTechnical Reviewへ提出します。'
  ], 'The request becomes Pending Technical Review and is visible to the reviewer. || Pending Technical Reviewとなり、審査担当に表示されます。',
    'Warnings identify useful additions; blockers prevent submission. Do not invent content just to pass validation. || Warningは推奨情報、Blockerは提出を妨げる不足です。条件を通すための架空情報は入力しないでください。') +
  P('7.2 Review technical readiness || 7.2 技術的な準備を審査', [
    'Open Site Visit → requests/data review → Technical Review Queue. || Site Visit → 申請・情報確認 → Technical Review Queueを開きます。',
    'Read Requirement, Machine &amp; Site, attachments and review history. || 要件、機械・現場、添付、審査履歴を確認します。',
    'Record the review outcome, skill/visit suitability and guidance. Return incomplete requests with specific information needed. || 判定、スキル・訪問の適合性、指示を記録します。不足があれば必要情報を明示して差し戻します。',
    'When ready, confirm the state that permits scheduling. The coordinator then schedules the date and team in Site Visit. || 準備完了なら日程調整を許可する状態にし、調整担当がSite Visitで日時とチームを設定します。'
  ], 'The decision is explicit, for example More Information Required or Ready to Schedule. || More Information RequiredまたはReady to Scheduleなど、結果が明確になります。') +
  N('A request and its appointment have separate states. Check the reason for On Hold, Cancelled or Closed before proceeding. Link legacy unlinked requests only through supported actions and to the same customer. || 申請と訪問予定は別の状態を持ちます。On Hold・Cancelled・Closedの場合は理由を確認します。未紐付けの旧申請は画面の対応操作で同じ顧客にリンクします。'))

C('visits', 'Site Visit: team, appointment and survey || Site Visit：チーム編成・日程・調査', 'Site Visit || Site Visit', 'Coordinators / engineering leads / assigned engineers || 調整担当・技術責任者・担当エンジニア',
  P('8.1 Prepare the team and confirm the appointment || 8.1 チームを準備して訪問を確定', [
    'Open a request ready to schedule and create/open its linked Site Visit. || 日程調整可能な申請から、紐づくSite Visitを作成または開きます。',
    'In Preparation, set date/time, site, type and responsible people. Check skills and availability. || 準備工程で日時、場所、種類、担当者を設定し、スキルと空き状況を確認します。',
    'Assign engineers and review individual responses. Coordinate information requests or proposed new times before adjusting the appointment. || 技術者を割り当てて各人の回答を確認し、追加情報依頼や日時提案を調整して予定を修正します。',
    'Record actual customer confirmation and check the brief, contacts, access instructions and required documents. || 実際の顧客確認を記録し、概要、連絡先、入場手順、持参資料を確認します。',
    'Before travelling, verify the confirmed appointment and your own accepted assignment. || 出発前に訪問確定と自分の担当受諾を確認します。'
  ], 'Time, team and required team/customer confirmations are complete. || 日時、チーム、必要な社内・顧客確認が揃っています。') +
  P('8.2 Check in and record the survey || 8.2 チェックインと調査記録', [
    'Open your appointment and Check in on arrival. Record actual company and customer attendees. || 到着時に自分の訪問を開いてCheck inし、実際の自社・顧客参加者を記録します。',
    'Use the location action if you want to include coordinates. Check-in remains possible if location cannot be read. || 位置情報を付ける場合は取得ボタンを使います。取得できなくても位置情報なしでCheck inできます。',
    'In Survey, work through checklist categories and filter unanswered required questions. || 調査工程で分類別チェックリストを記入し、必須未回答のフィルターで不足を確認します。',
    'Record answers, notes, findings, measured values, units, severity and relevant evidence files. || 回答、メモ、発見事項、測定値、単位、重要度、証拠ファイルを記録します。',
    'Check autosave status. Retry failed saves and wait for success before Check out with a closing note. || 自動保存を確認し、失敗時は再試行します。保存完了後に終了メモを記入してCheck outします。'
  ], 'Times, answers and evidence remain present after reopening the visit. || 再度開いて時間・回答・証拠が保存されていることを確認します。',
    'Zero is a valid numeric answer. Survey fields may become read-only during report review or after closure. || 数値の0は有効な回答です。報告書審査中や完了後は調査欄が閲覧専用になる場合があります。') +
  P('8.3 Handle appointment changes || 8.3 訪問予定の変更', [
    'Review current state and history before changing dates, assignees or using available cancel/close actions. || 日程・担当変更や取消・終了操作の前に現在の状態と履歴を確認します。',
    'Record the reason and facts the team needs, such as customer postponement or a no-show. || 顧客都合の延期や不在など、理由とチームに必要な事実を記録します。',
    'Recheck relevant acceptance and confirmation requirements for the new state. || 変更後の状態に必要な受諾・確認を再確認します。'
  ], 'The appointment reflects actual events with history; no duplicate appointment is used to bypass the workflow. || 実際の状況と履歴が反映され、手順回避のための重複予定を作成しません。'))

C('assignments', 'My Assignments and survey reports || My Assignmentsと現地調査報告', 'My Assignments / Site Visit → report and review || My Assignments / Site Visit → 報告・審査', 'Assigned engineers / report reviewers || 担当技術者・報告書審査者',
  P('9.1 Respond to your site assignment || 9.1 現地業務の割当に回答', [
    'Open My Assignments or the site-visit shortcut in My Work. || My AssignmentsまたはMy Workの現地業務ショートカットを開きます。',
    'Open an awaiting-response item and read Brief and the appointment time. || 回答待ちを開き、Briefと日時を確認します。',
    'Use Accept or decline and choose Accepted, Declined, Information Requested or New Time Proposed. || Accept or declineから受諾、辞退、情報依頼、別日時提案の該当回答を選びます。',
    'Add a note, particularly for decline or information requests. Check the item under today/upcoming as appropriate. || 特に辞退・情報依頼にはメモを添え、日程に応じた今日・今後の一覧を確認します。',
    'Use On site and Report for work and reporting on the same appointment. || 同じ訪問のOn siteとReportで作業・報告を行います。'
  ], 'Your own account records your response accurately. || 割当本人のアカウントで回答が正しく記録されます。') +
  P('9.2 Draft, review and revise a survey report || 9.2 調査報告書の作成・審査・改訂', [
    'Open the Site Visit report stage; create or reopen its draft and review survey data and attachments. || Site Visitの報告工程で下書きを作成または開き、調査情報と添付を確認します。',
    'Complete Visit summary, Engineer conclusion, Recommended solution and Next step, plus additional sections relevant to the work. || Visit summary、Engineer conclusion、Recommended solution、Next stepの4項目と必要な追加項目を記入します。',
    'Summary and Conclusion each need at least 20 characters for submission. Reconcile conclusions with measurements, then Save draft. || 提出にはSummaryとConclusionが各20文字以上必要です。測定結果と結論を照合し、下書き保存します。',
    'Submit for review. An authorized reviewer selects Approved or Revision Requested, giving clear reasons for changes. || 審査へ提出します。権限者がApprovedまたはRevision Requestedを選び、修正理由を明示します。',
    'Follow the available edit/revision action, review Change summary and resubmit after requested changes. || 表示される編集・改訂操作に従い、変更概要を確認して修正後に再提出します。',
    'After approval, record the customer representative’s actual acknowledgement and track actions with owner, due date and status. || 承認後、顧客代表の実際の確認を記録し、担当・期限・状態付きアクションを追跡します。'
  ], 'The reviewed report, revision history and follow-up remain linked to the original Inquiry. || 審査済み報告書、版履歴、フォロー業務が元のInquiryに紐づきます。',
    'Site Visit reports live in the visit. Service/UAT/Installation/Inspection/POC reports and customer signing links use the separate Reports workflow. || 現地調査報告は訪問内にあります。Service・UAT・Installation・Inspection・POC報告と顧客署名リンクは別のReports手順です。'))

C('estimate', 'Estimate Cost: organize project costs || Estimate Cost：原価項目の作成・整理', 'Estimate Cost / Inquiry → Estimate Cost || Estimate Cost / Inquiry → Estimate Cost', 'Estimate owners / assigned engineers / engineering managers || 見積責任者・担当技術者・技術管理者',
  P('10.1 Open the workspace and structure costs || 10.1 作業画面を開いて原価を構成', [
    'Create an estimate from Inquiry or open Estimate Cost. Verify Inquiry/Estimate numbers, revision, owner and deadline. || Inquiryから見積を作成するかEstimate Costを開き、番号、版、責任者、期限を確認します。',
    'Read Summary, then use Cost Items to organize Category → Module → Item around actual subsystems. || Summaryを確認し、Cost Itemsで実際のサブシステムに合わせてCategory → Module → Itemを構成します。',
    'Use Add item or quick entry. Enter description, brand, model, specification, quantity, unit and unit cost. || Add itemまたは簡易入力で説明、ブランド、型式、仕様、数量、単位、単価を入力します。',
    'Select supplier and price source with reference number, source job, price date, item owner, status and relevant notes. || 仕入先、価格情報源、参照番号、参照案件、価格日、担当者、状態、必要メモを設定します。',
    'Save and check line totals and summary. Edit/delete only in a writable revision. || 保存後に明細合計と総額を確認し、編集・削除は編集可能な版だけで行います。'
  ], 'Items are in the correct module; quantity × unit cost agrees with line totals and Summary. || 正しいModuleに項目が入り、数量×単価が明細・Summaryと一致します。',
    'Do not multiply module sets twice when a template already scales item quantities. Some multi-item entry paths can save only part of a batch; inspect successful rows before retrying. || Templateで数量がセット数倍される場合は二重計算しないでください。複数追加の一部だけ保存される経路では、再試行前に成功済み行を確認します。') +
  P('10.2 Use reference costs and review totals || 10.2 参考原価と全体確認', [
    'Search prior prices or use item/template tools after checking model and scope. || 型式と範囲を確認してから過去価格や項目・Template機能を使います。',
    'Filter or open modules from Summary to inspect each subsystem. || SummaryからModuleを絞り込み・開き、各システムを確認します。',
    'For missing prices, enter a meaningful status/note and follow up in Waiting Supplier Price. || 未取得価格には状態・説明メモを記載し、Waiting Supplier Priceで追跡します。',
    'Review engineering, installation, travel, accommodation, other costs and contingency for omissions or double counting. || 技術、設置、旅費、宿泊、その他、予備費を確認し、漏れや二重計上を防ぎます。',
    'Use Export when needed; verify downloaded filename, estimate number and revision. || 必要に応じてExportし、ファイル名、見積番号、版を確認します。'
  ], 'Each cost can be traced to an item, price source and revision. || 各原価を項目、価格情報源、版まで追跡できます。',
    'This export contains internal cost, not a customer selling quotation. || この出力は社内原価であり、顧客向け販売見積書ではありません。'))

C('effort', 'Man-hours, expenses and contingency || 工数・経費・予備費', 'Estimate → Engineering Man-hour / Other Project Cost || Estimate → Engineering Man-hour / Other Project Cost', 'Cost estimators || 原価見積担当',
  P('11.1 Record labor in work packages || 11.1 Work packageに労務費を入力', [
    'Open Engineering Man-hour and create a Work package or add an activity to an existing package. || Engineering Man-hourでWork packageを作成するか、既存packageにActivityを追加します。',
    'Choose Engineering or Installation &amp; Service as cost type, and Internal or Supplier as provider. || 原価種類をEngineeringまたはInstallation &amp; Service、提供元をInternalまたはSupplierから選びます。',
    'Enter activity, department, level, engineer count, man-days per person, hours/day and responsible person. || 作業、部署、レベル、人数、1人当たり日数、1日当たり時間、担当者を入力します。',
    'Internal work uses Engineering Rate. For suppliers, enter supplier, quotation reference, price date and quoted rate. || 社内作業はEngineering Rateを使用します。外注は仕入先、見積番号、価格日、提示単価を入力します。',
    'Save and inspect package allocation, man-hours and line cost. || 保存し、package、工数、明細原価を確認します。'
  ], 'Man-hours = people × days/person × hours/day. Labor cost = people × days/person × daily rate. || 工数＝人数×1人当たり日数×時間/日。労務費＝人数×1人当たり日数×日単価です。',
    'Training example: 2 people × 3 days × 8 hours = 48 person-hours; at THB 2,000/person/day, cost is THB 12,000. Real rates must come from the approved master. || 練習例：2人×3日×8時間＝48人時。2,000バーツ/人日なら12,000バーツです。実際は承認済みマスター単価を使います。') +
  P('11.2 Add associated and other project costs || 11.2 関連経費とその他原価を追加', [
    'Add package expenses such as travel, accommodation, per diem, transportation or equipment rental. || packageに旅費、宿泊、日当、輸送、機材レンタルなどを追加します。',
    'Enter type, description, quantity, unit, unit cost, supplier/reference and owner as offered. || 種類、説明、数量、単位、単価、仕入先・参照、担当者を入力します。',
    'Use Other Project Cost for costs outside existing items; record category and a traceable reason. || 他に含まれない費用はOther Project Costに分類と確認可能な理由を付けて登録します。',
    'Set the authorized Contingency rate, save and verify the calculated amount. || 許可されたContingency rateを設定して保存し、計算額を確認します。',
    'Return to Summary and check that the same travel/accommodation cost is not entered both as a Cost item and an Expense. || Summaryに戻り、同じ旅費・宿泊費をCost itemとExpenseで二重計上していないか確認します。'
  ], 'All cost components have a source and agree with the saved system totals. || 全原価に根拠があり、保存後のシステム合計と一致します。'))

C('estimate-import', 'Import Excel estimates and use module templates || Excel原価見積の取込とModule Template', 'Estimate → Cost Items → Import / Module Templates || Estimate → Cost Items → Import / Module Templates', 'Estimate owners / authorized template maintainers || 見積責任者・Template管理権限者',
  P('12.1 Import an Excel estimate || 12.1 Excel原価見積を取り込む', [
    'Open a writable estimate in Draft, Engineering Input or Revision Required → Cost Items → Import. || Draft、Engineering Input、Revision Requiredの編集可能な見積でCost Items → Importを開きます。',
    'Select a supported company <b>.xlsx</b> file up to <b>20 MB</b>. Calculate and save it in Excel first, then wait for Preview. || 対応する会社書式の <b>.xlsx、20 MB以下</b> を選びます。事前にExcelで再計算・保存し、Previewを待ちます。',
    'Check source customer/project, price date, hours/day, categories, included/excluded rows and totals against the workbook. || 元顧客・案件、価格日、時間/日、分類、取込・除外行、合計を元ブックと照合します。',
    'Verify internal labor going to Man-hour, outsourced work going to Cost items, and customer-supplied items referenced at zero purchase cost. || 社内労務がMan-hour、外注がCost itemに入り、顧客支給品の購入原価が0で参照されることを確認します。',
    'Confirm import only after reconciliation. Check Cost Items, Man-hour, Summary and Import history. || 照合後にConfirm importし、Cost Items、Man-hour、Summary、取込履歴を確認します。'
  ], 'An import receipt and verified totals appear in the same estimate revision. || 同じ見積版に取込結果と確認済み合計が記録されます。',
    'The whole-workbook importer expects the supported Summary cost layout, with at most 1,000 rows; it does not support every Excel layout. Use the offered CSV/TSV/XLSX table importer for column-header tables. Formulas/external links are not executed and the original workbook bytes are not retained by this estimate importer; keep the source separately. Imports do not approve estimates. On errors or conflicts, correct the source or reload the latest revision and review Preview again. || ブック取込は対応するSummary cost書式・最大1,000行が対象で、全Excel書式に対応するわけではありません。列見出し形式は画面のCSV/TSV/XLSX表取込を使います。数式・外部リンクは実行せず、この見積取込では元ブック本体を保存しないため別途保管します。取込で承認は行われません。エラー・競合時は元データ修正または最新版再読込後、Previewを再確認します。') +
  P('12.2 Maintain and apply module templates || 12.2 Module Templateを管理・適用', [
    'Open Module Templates, search/filter Discipline and Status, then read template details. || Module Templatesで分野・状態を検索・絞り込みし、詳細を確認します。',
    'Authorized users can create a template with header and per-set items, or copy/edit an existing template. || 権限者は見出しと1セット分の明細を登録し、既存Templateの複製・編集も行えます。',
    'In Estimate → Cost Items, choose a template, review items, set module name and number of sets, then apply it. || Estimate → Cost ItemsでTemplateを選び、内容、Module名、セット数を確認して適用します。',
    'Save a reusable estimate module as a template after checking its prices and suppliers. || 再利用可能な見積Moduleは価格・仕入先を確認してTemplate保存します。',
    'Authorized maintainers can Retire obsolete templates and confirm a suitable replacement for users. || 管理権限者は旧TemplateをRetireし、代替版を確認します。'
  ], 'Added items retain template provenance; later template edits do not rewrite existing estimates. || 追加項目にTemplate参照が残り、後のTemplate変更で既存見積が変わることはありません。'))

C('estimate-review', 'Estimate assignment, validation, approval and revisions || 見積の割当・検証・承認・改訂', 'Estimate → Assignment / Validation / Engineering Review || Estimate → Assignment / Validation / Engineering Review', 'Owners / section assignees / approvers || 責任者・分類担当者・承認者',
  P('13.1 Assign estimate work || 13.1 原価見積の作業を割り当てる', [
    'In Assignment, add responsibility for a section without an owner. || Assignmentで未担当の分類に割当を追加します。',
    'Choose Section, Owner, optional Support and Due date. A section can be assigned before cost items exist. || Section、Owner、任意のSupport、期限を選びます。原価項目がなくても割当できます。',
    'Save; assignees then update status, progress and comments within their permissions. || 保存後、担当者が権限内で状態・進捗・コメントを更新します。',
    'Read save and email results separately. If email is failed or disabled, the coordinator should notify the assignee through the team’s channel. || 保存結果とメール結果を分けて確認します。メール失敗・無効時は調整担当がチームの連絡手段で担当者へ伝えます。'
  ], 'The correct section displays the assignment and deadline. || 対象分類に担当と期限が表示されます。',
    'Email is disabled in Team Test. A successful save remains valid if email fails. Changing only status, progress or deadline does not automatically resend email. || Team Testではメール送信を無効にしています。メール失敗でも保存成功した業務は残ります。状態・進捗・期限だけの変更では自動再送されません。') +
  P('13.2 Validate and submit for engineering review || 13.2 検証して技術承認へ提出', [
    'Open Validation, distinguish Critical from Warning and follow links to correct Cost Items, Man-hour or Other Cost. || ValidationでCriticalとWarningを区別し、Cost Items・Man-hour・Other Costを修正します。',
    'Check quantities, units, price sources/dates, suppliers, labor rates and scope completeness. || 数量、単位、価格情報源・日付、仕入先、労務単価、範囲の完全性を確認します。',
    'Reconcile Summary and Assignment, then Submit when allowed. || SummaryとAssignmentを照合し、許可された段階でSubmitします。',
    'The approver reviews scope and cost in Engineering Review and chooses Approve or Request revision with a clear reason. || 承認者はEngineering Reviewで範囲と原価を確認し、Approveまたは理由付きRequest revisionを選びます。'
  ], 'Status and history show the decision, with no unresolved Critical blocking the action. || 判定が状態・履歴に残り、処理を妨げるCriticalが解消されています。') +
  P('13.3 Revise locked estimates and compare versions || 13.3 確定見積の改訂と版比較', [
    'Read Revision History for prior versions, reasons, actors and totals. || Revision Historyで旧版、理由、実施者、合計を確認します。',
    'Use Create revision when permitted and describe the reason and changes. || 許可されるCreate revisionで改訂理由と変更内容を記載します。',
    'Edit the new revision, then choose source/target versions in Compare Revision to check differences. || 新版を編集し、Compare Revisionで比較元・先を選んで差分を確認します。',
    'Run Validation and resubmit through approval. || Validationを確認し、再承認へ提出します。'
  ], 'Old versions retain history and the new revision has its own reason and review. || 旧版の履歴が残り、新版には独自の理由と審査結果が付きます。',
    'Approved/Locked costs cannot be edited directly. Projects and procurement documents may reference an earlier snapshot; always check the revision. || Approved・Lockedは直接編集できません。Projectや購買書類が旧版スナップショットを参照する場合があるため、必ず版を確認します。'))

C('pricing', 'Reference prices and supplier quotations || 参考価格と仕入先見積書', 'Price Library / Supplier Quotation / Waiting Supplier Price || Price Library / Supplier Quotation / Waiting Supplier Price', 'Estimators / Purchasing || 見積担当・購買',
  P('14.1 Find prices and history || 14.1 価格と履歴を探す', [
    'Search Price Library by item code, description, brand, model or supplier and apply available filters. || Price Libraryでコード、説明、ブランド、型式、仕入先を検索・絞り込みします。',
    'Match units, model, specifications, price date and source to the item being estimated. || 対象項目と単位、型式、仕様、価格日、情報源を照合します。',
    'Open offered price details/history to review earlier references and trends. || 価格詳細・履歴で過去の参照と推移を確認します。',
    'If some estimates failed to load, Refresh or resolve access before treating the list as complete. || 一部見積の読込失敗時は再読込やアクセス確認を行い、不完全な一覧を全データとみなさないでください。'
  ], 'The selected reference includes a date and document number; an item name alone is insufficient. || 日付と参照番号を持つ価格を選び、品名だけで古い価格を流用しません。') +
  P('14.2 Register a supplier quotation || 14.2 仕入先見積書を登録', [
    'Open Supplier Quotation and its upload/add action. || Supplier Quotationの追加・アップロード操作を開きます。',
    'Choose the supplier and enter reference number, received date, expiry, currency, amount and Inquiry/Project fields. || 仕入先、番号、受領日、有効期限、通貨、金額、Inquiry・Projectを入力します。',
    'Select the original file, review the fields and save. || 原本を選択し、内容を確認して保存します。',
    'Find the saved entry, check validity and download the original before referencing its prices in an estimate. || 登録を検索し、有効性と原本ダウンロードを確認してから価格を見積に参照します。'
  ], 'Register and original file match. Uploading does not automatically update every estimate. || 台帳と原本が一致します。アップロードだけで各見積の原価は更新されません。') +
  P('14.3 Resolve waiting prices at their source || 14.3 元データを修正して価格待ちを解消', [
    'Search Waiting Supplier Price by supplier, item or estimate number. || Waiting Supplier Priceで仕入先、品目、見積番号を検索します。',
    'Read the reason: zero/missing price, no price date, or price older than 180 days. || 価格0・未設定、価格日なし、180日超の古い価格のいずれかを確認します。',
    'Follow up with the supplier, then update price, date and reference in a writable source estimate revision. || 仕入先へ確認し、元見積の編集可能な版で価格・日付・参照を更新します。',
    'Return to the waiting list and Refresh. || 一覧に戻ってRefreshします。'
  ], 'The item leaves the waiting criteria when source data is complete. || 元データが条件を満たすと価格待ちの対象から外れます。',
    'This view is derived from supplier-linked cost items. It does not dispatch RFQs or change a cost item’s status automatically. || 仕入先付き原価項目から算出する画面であり、RFQ自動送信や項目状態の自動変更は行いません。'))

C('projects', 'Projects and project documents || プロジェクトと関連書類', 'Projects → Project Portfolio || Projects → Project Portfolio', 'PM / authorized project users / members || PM・プロジェクト権限者・メンバー',
  P('15.1 Create a project from an approved estimate || 15.1 承認済み見積からプロジェクトを作成', [
    'Open Projects → Project Portfolio → Create project. || Projects → Project Portfolio → Create projectを開きます。',
    'Select an approved estimate within your scope; verify customer, job and revision. || 自分の範囲の承認済み見積を選び、顧客、案件、版を確認します。',
    'Complete Customer PO number, PO date, Project manager, Lead engineer, Start date, Target delivery and Site. Delivery must not precede the start. || 顧客PO番号、PO日、PM、Lead engineer、開始日、目標納期、現場を入力します。納期は開始日以降にします。',
    'Check Contracting customer and End user, then save. || 契約顧客とEnd userを確認して保存します。',
    'Find the new project, check its number and open Documents to inspect its prepared folders. || 作成したProjectの番号を確認し、Documentsで用意されたフォルダーを確認します。'
  ], 'The project references the correct estimate revision and has 15 standard folders. || 正しい見積版に紐づき、標準15フォルダーが作成されます。') +
  P('15.2 Store and download files || 15.2 ファイルの保管とダウンロード', [
    'Select Documents on the project row and choose the appropriate folder. || Project行のDocumentsを開き、内容に合うフォルダーを選びます。',
    'Choose the file and enter any required type/notes; check the filename and destination before uploading. || ファイル、必要な種類・メモを指定し、アップロード前に名前と保存先を確認します。',
    'Wait for success, locate the file and check that the downloaded file opens correctly. || 成功を待ち、一覧とダウンロードしたファイルの正常表示を確認します。',
    'For drawings requiring approval, use Import Drawing from the source task as described in the signing chapter. || 承認が必要な図面は署名章に従って元TaskからImport Drawingを使い、作成担当とのリンクを維持します。'
  ], 'Authorized teammates can find the file in the same folder. || 権限のあるメンバーが同じフォルダーからファイルを見つけられます。',
    'Storage depends on the environment: Team Test may use local test storage; Production uses company-configured storage. Uploading a file does not approve it. || 保存先は環境によります。Team Testではローカルのテスト領域、Productionでは会社設定の保存先を使います。アップロードだけでは承認されません。') +
  T(['Code || 番号', 'Folder || フォルダー', 'Contents || 内容'], [
    ['00 || 00', 'To do list || To do list', 'Tasks and open issues || 業務と未解決事項'],
    ['01 || 01', 'Concept Design and Proposal || Concept Design and Proposal', 'Concepts and proposals || 構想・提案'],
    ['02 || 02', 'Drawing || Drawing', 'Drawings and layouts || 図面・レイアウト'],
    ['03 || 03', 'Estimate cost || Estimate cost', 'Cost estimates and reference revisions || 原価見積・参照版'],
    ['04 || 04', 'Quote || Quote', 'Related quotations || 関連見積書'],
    ['05 || 05', 'PO || PO', 'Purchase orders || 発注書'],
    ['06 || 06', 'Specifications and Documentation || Specifications and Documentation', 'Requirements and standards || 仕様・規格'],
    ['07 || 07', 'Development || Development', 'Programs, settings and development || プログラム・設定・開発'],
    ['08 || 08', 'Schedule || Schedule', 'Work schedules || 工程表'],
    ['09 || 09', 'Installation || Installation', 'Installation records || 設置記録'],
    ['10 || 10', 'Report || Report', 'Reports || 報告書'],
    ['11 || 11', 'Manual and Document || Manual and Document', 'Operation and maintenance manuals || 操作・保守マニュアル'],
    ['12 || 12', 'DATA &amp; EXAMPLE || DATA &amp; EXAMPLE', 'Data and examples || データ・例'],
    ['13 || 13', 'Pic and Video || Pic and Video', 'Photos and videos || 写真・動画'],
    ['14 || 14', 'Ref || Ref', 'References || 参考資料']
  ]))

C('schedule', 'Project Schedule and baselines || Project ScheduleとBaseline', 'Projects → Project Schedule || Projects → Project Schedule', 'PM / planners / assigned members || PM・計画担当・担当メンバー',
  P('16.1 Plan work and save a baseline || 16.1 工程作成と基準計画の保存', [
    'Choose the project and verify its name and schedule version before editing. || 編集前にプロジェクト名と計画版を確認します。',
    'Planners use Add schedule row to enter title, Phase/Task type, parent, visibility, PIC, start date, working-day duration and effort. || 計画担当はAdd schedule rowで名称、Phase・Task、親業務、公開範囲、PIC、開始日、稼働日数、工数を入力します。',
    'Check the calculated finish and task relationships, save and inspect the actual table row. || 計算された終了日と業務関係を確認し、保存後に表の行を確認します。',
    'Use Create baseline for the reference plan with a name and reason. Explain plan changes when saving later baselines. || Create baselineで基準計画に名称・理由を付けます。次のBaselineを作る場合は変更理由を説明します。',
    'Compare the current schedule and forecast finish against baseline, and address delays with owners. || 現在計画・完了予測とBaselineを比較し、遅延を担当者と調整します。'
  ], 'Tasks have owners and a usable reference baseline. || 業務担当と比較用Baselineが揃います。',
    'Tasks from Resource Plan/Punchlist retain their governed plan-approval workflow. The legacy schedule is not a bypass. || Resource Plan・PunchlistのTaskは専用の計画承認手順に従います。旧工程表から承認手順を回避することはできません。') +
  P('16.2 Review requests for additional days || 16.2 延長日数の申請を審査', [
    'Open the task’s Updates/requests and read the requested days and reason. || 業務のUpdates・申請から希望日数と理由を確認します。',
    'Consider impact on delivery and dependent work before accepting or rejecting. || 納期と関連業務への影響を確認して承認・却下を判断します。',
    'Record the decision and explanation, then verify the updated schedule dates. || 判定と説明を保存し、調整後の日付を確認します。',
    'For a governed task with a proposed plan awaiting approval, use its Resource Plan workflow. || 承認待ちの計画提案があるTaskはResource Planの専用手順で処理します。'
  ], 'The request has a decision and the dates match the approved outcome. || 申請結果と承認された日付が一致します。'))

C('resources', 'Resource Plan and Project Timeline || Resource PlanとProject Timeline', 'Planning → Resource Plan / Project Timeline || Planning → Resource Plan / Project Timeline', 'Planners / team leads / PM || 計画担当・チームリーダー・PM',
  P('17.1 Check team capacity || 17.1 人員の対応可能量を確認', [
    'Open Resource Plan and check the period, people, work type and status filters. || Resource Planで期間、人、業務種類、状態のフィルターを確認します。',
    'Authorized users set members’ Weekly capacity in working days per week. || 権限者はメンバーのWeekly capacityを週当たり稼働日数で設定します。',
    'In Work items, use Plan effort for inquiries/estimates still using aggregate planning; enter dates and man-days. || 全体計画を使用中のInquiry・EstimateはWork itemsのPlan effortで日付と人日を入力します。',
    'For projects, open the source to change dates/PIC. Inspect Timeline and Workload for overlaps or overload. || Projectは元画面で日付・PICを変更します。TimelineとWorkloadで重複・過負荷を確認します。',
    'Export the filtered plan as CSV and verify the exported row count. || 絞り込んだ計画をCSV出力し、件数を確認します。'
  ], 'Workload can be compared with capacity; missing effort/capacity is shown as incomplete data. || 負荷と対応可能量を比較でき、工数・capacity不足は情報未完として表示されます。',
    'Man-days measure labor; duration measures elapsed working days. Calculations use Monday–Friday and company holidays. Personal leave is not automatically deducted. Unknown capacity is not zero workload. || 人日は労働量、期間は稼働日の長さです。月～金と会社休日を使って計算し、個人休暇は自動控除されません。capacity不明を負荷0と解釈しないでください。') +
  P('17.2 Create a task and submit its plan || 17.2 Task作成と計画承認申請', [
    'Open Resource Plan → Tasks → create, then select an accessible Inquiry or Project. || Resource Plan → Tasksで新規作成し、アクセス可能なInquiryまたはProjectを選びます。',
    'Enter title, expected output, priority, one assignee, start, working-day duration and effort in MD. || 名称、成果物、優先度、担当者1人、開始日、稼働日数、MD工数を入力します。',
    'Read before/after Workload. Adjust person, dates or effort if capacity is exceeded. || 変更前・後のWorkloadを確認し、過負荷なら担当、日付、工数を調整します。',
    'Submit for approval. An authorized planner checks impact and approves or returns it for changes. || 承認申請し、権限のある計画担当が影響を確認して承認または差し戻します。',
    'Overload or incomplete calculation requires the approver’s override reason when supported. After approval, wait for assignee acceptance. || 過負荷または計算情報不足を許容する場合は承認者のoverride理由が必要です。承認後に担当者の受諾を待ちます。'
  ], 'The approved plan is committed and appears in the assignee’s Task inbox. || 承認計画が確定負荷になり、担当者のTask inboxに表示されます。',
    'Unapproved proposals do not increase committed workload. Approving the first child task of an inquiry switches effort counting to tasks; break down the remaining work completely. || 未承認提案は確定負荷に加算されません。Inquiryの最初の子Task承認後はTask単位の工数集計に切り替わるため、残作業も漏れなく分解します。') +
  P('17.3 Review the project timeline || 17.3 プロジェクト全体の日程を見る', [
    'Open Project Timeline and set period/project filters. || Project Timelineで期間・プロジェクトを絞り込みます。',
    'Review planned ranges, delivery dates, progress and delayed/overdue work shown. || 計画期間、納期、進捗、延期・遅延業務を確認します。',
    'Open a project’s Project Schedule and change the plan only through actions your role permits. || Project Scheduleを開き、自分の権限で許可された操作から計画を変更します。'
  ], 'Staffing and delivery decisions refer to the same project plan. || 人員配置と納期の判断が同じプロジェクト計画に基づきます。'))

C('my-work', 'My Work and Team Activity: accept, report and review scores || My WorkとTeam Activity：受諾・報告・スコア確認', 'My Work → Task inbox / Project schedule tasks · Team Activity || My Work → Task inbox / Project schedule tasks・Team Activity', 'Assigned members / team leaders || 担当メンバー・チームリーダー',
  P('18.1 Accept and execute a task || 18.1 Taskを受諾して実行', [
    'Open Task inbox, filter awaiting acceptance and read the task details. || Task inboxで受諾待ちを絞り込み、詳細を確認します。',
    'Read the scope and approved plan. Accept using your own account when ready. || 範囲と承認計画を読み、対応可能なら本人のアカウントで受諾します。',
    'Update status, progress, actual start/finish and notes to match real work. || 実際の作業に合わせて状態、進捗、実績開始・終了、メモを更新します。',
    'Use Blocked with an explanation when waiting on an obstacle. On completion, set Done and describe the deliverable for verification. || 障害で止まる場合はBlockedと理由を記録します。完了時はDoneにし、検収対象の成果を記載します。',
    'Wait for the planner to verify, record acceptance notes and close the task. || 計画担当による検収、確認メモ、クローズを待ちます。'
  ], 'Done means work finished awaiting verification; Closed means verified and closed. || Doneは作業完了・検収待ち、Closedは検収済み・完了です。') +
  P('18.2 Propose a replacement plan || 18.2 計画変更を提案', [
    'Open your task’s replan action and enter proposed start, duration, effort and reason. || 自分のTaskで計画変更を選び、開始日、期間、工数、理由を入力します。',
    'Review calculated workload and submit the proposal. || 算出負荷を確認して提案を提出します。',
    'Continue using the committed plan while awaiting approval; check the approval or return result. || 承認待ちは既存の確定計画を使い、承認・差し戻し結果を確認します。',
    'Accept the new plan again after approval. || 新計画の承認後に再度受諾します。'
  ], 'The plan changes only after approval and the assignee acknowledges the new version. || 承認後にだけ計画が変わり、担当者が新版を再確認します。') +
  P('18.3 Update legacy project schedule tasks || 18.3 既存の工程表業務を更新', [
    'Choose Project schedule tasks → My tasks; prioritize urgent and outstanding groups. || Project schedule tasks → My tasksで緊急・未完業務から確認します。',
    'Open your assigned row and edit permitted progress, status, actual dates, forecast finish and notes. || 自分の担当行を開き、許可された進捗、状態、実績日、完了予測、メモを更新します。',
    'Use Add my task for supported personal subtasks, and Request more days for a duration extension. || 対応業務の個人子タスクはAdd my task、延長はRequest more daysを使います。',
    'Read My updates for history and request outcomes. || My updatesで履歴と申請結果を確認します。'
  ], 'My Work and Project Schedule show consistent progress for the same work. || 同じ業務のMy WorkとProject Scheduleの進捗が一致します。',
    'Task inbox, legacy schedule tasks and site-visit assignments have different acceptance/replan workflows. Use the action for that work type. || Task inbox、旧工程表業務、現地訪問割当は受諾・計画変更手順が異なります。業務種類に合った操作を使います。') +
  P('18.4 Delete an incorrectly created personal subtask || 18.4 誤登録した個人子タスクを削除', [
    'Open the personal subtask you created in Project schedule tasks and verify its parent and title. || Project schedule tasksで自分が作成した個人子タスクを開き、親業務と名称を確認します。',
    'Use Delete only where the screen allows deletion of your own subtask; read the confirmation and confirm the correct item. || 自分の子タスクに削除が許可されている場合のみDeleteを使い、確認内容と対象を照合して実行します。',
    'Recheck My tasks and its parent schedule. Governed or shared tasks follow their own permitted workflow. || My tasksと親工程を確認します。承認管理対象・共有Taskにはそれぞれの手順を使います。'
  ], 'Only the intended personal subtask is removed. || 対象の個人子タスクだけが削除されています。') +
  P('18.5 Report progress and review my score || 18.5 進捗を報告し自分のスコアを確認', [
    'Open Team Activity from Organisation or the button in My Work, then choose My activity. || OrganisationメニューまたはMy WorkのボタンからTeam Activityを開き、My activityを選択します。',
    'Choose a month and date. Review On time, Late, Missing, Pending or Exempt status, activity and the selected KPI-cycle score. || 月と日付を選び、On time、Late、Missing、Pending、Exemptの状態、操作履歴、選択したKPI期間のスコアを確認します。',
    'Under Reporting commitments, choose Report progress. Enter results, the next step and expected date, plus evidence or a blocker and follow-up plan, then save today’s report. || Reporting commitmentsでReport progressを選び、成果、次の対応と予定日、根拠または障害と対応計画を入力して本日の報告を保存します。',
    'Use Open source work to change the task progress percentage. Add clarification when an explanation must be retained with the review cycle. || Taskの進捗率を変更する場合はOpen source workを使い、評価期間に説明を残す場合はAdd clarificationを使います。'
  ], 'The daily report appears as evidence on the selected date and your available cycle score is visible. || 日次報告が選択日の根拠として表示され、閲覧可能な期間スコアを確認できます。',
    'The system measures activity inside the app, not login counts. Daily reporting does not change the source task’s progress percentage. || システムはアプリ内の操作を記録し、ログイン回数を採点しません。日次報告では元Taskの進捗率は変わりません。') +
  P('18.6 Monitor team activity and reporting status || 18.6 チームの利用状況と報告状態を確認', [
    'Open Team Activity and select a date, project or department, or find a member within your authorized scope. || Team Activityを開き、権限範囲内で日付、プロジェクト、部署を選ぶかメンバーを検索します。',
    'Use Active today, Updated work, Visited no update, No activity yet and Updates overdue to filter people who need follow-up. Review latest activity, sessions, updated tasks and reporting coverage. || Active today、Updated work、Visited no update、No activity yet、Updates overdueで要確認者を絞り込み、最終利用、利用回数、更新業務、報告網羅率を確認します。',
    'Choose a KPI cycle and select a member to inspect the calendar, activity, evidence, commitments and score. Project access shows only activity for that project. || KPI期間を選んでメンバーを開き、カレンダー、操作履歴、根拠、報告対象業務、スコアを確認します。プロジェクト権限ではそのプロジェクトの活動だけが表示されます。',
    'An authorized reviewer can exempt the selected day with a reason, or review 15 quality points using clarity, next steps and actual evidence. || Review権限のあるリーダーは、理由付きで選択日を対象外にするか、明確さ、次の対応、実際の根拠から品質15点を評価します。'
  ], 'Filters identify missing reports, and exemptions or quality scores retain reasons and evidence. || 未報告者を絞り込め、対象外設定または品質評価に理由と根拠が残ります。') +
  P('18.7 Configure reporting commitments and KPI cycles || 18.7 報告対象業務とKPI期間を設定', [
    'A manager with Manage access opens a member and chooses Add reporting commitment. Select assigned work, start and end dates, weekdays and the Bangkok deadline, then save before reporting begins. || Manage権限のあるリーダーがメンバーを開いてAdd reporting commitmentを選び、担当業務、開始日、終了日、曜日、バンコク時間の締切を設定して開始前に保存します。',
    'When reporting is no longer required, use Stop future reports, enter a reason and verify the effective stop date. || 報告が不要になった場合はStop future reportsを使い、理由を入力して終了日を確認します。',
    'A user with Configure access opens Configure KPI cycle to create a cycle with its name, start, end and review due dates, or selects an unpublished future cycle. || Configure権限のあるユーザーはConfigure KPI cycleを開き、名称、開始日、終了日、評価期限を設定して期間を作成するか、未確定の将来期間を選びます。',
    'Choose Trial for no KPI impact or Active for a 10% weight, then publish the selected-cycle policy before it starts because published rules cannot be changed retroactively. || KPIに影響しないTrialまたは比重10%のActiveを選び、確定後は遡及変更できないため開始前に選択期間のルールを確定します。'
  ], 'Reporting commitments are scheduled in advance and the KPI cycle shows the correct mode and dates. || 報告対象業務が事前設定され、KPI期間に正しいモードと日付が表示されます。',
    'A score requires at least 10 assessed days. When data is insufficient, the existing KPI keeps its full weight. || スコアには最低10日の評価対象日が必要です。データ不足の場合は従来KPIを100%使用します。'))

C('punchlist', 'Punchlist: resolve customer issues || Punchlist：顧客課題を完了まで追跡', 'Projects → Punchlist · customer issues || Projects → Punchlist・顧客課題', 'PM / planners / issue assignees || PM・計画担当・課題担当',
  P('19.1 Turn a customer issue into accountable work || 19.1 顧客課題を担当業務にする', [
    'Choose the project and add a customer issue with reporter, customer and reference. || Projectで顧客課題を追加し、報告者、顧客、参照を記録します。',
    'Describe the symptom or unmet expectation, expected deliverable and priority. || 症状・期待との差、必要な成果物、優先度を記載します。',
    'Select assignee, start, duration and MD. Check workload and submit the plan for approval. || 担当、開始日、期間、MDを設定し、負荷確認後に計画承認へ提出します。',
    'After approval, the member accepts and updates progress until Done. || 承認後、担当者が受諾してDoneまで進捗を更新します。',
    'The planner verifies the fix, records acceptance notes and closes the issue. || 計画担当が修正結果を検収し、確認メモを残して完了にします。'
  ], 'The issue has a reporter, linked work, dates and verification evidence. || 報告者、紐づく業務、日付、検収証拠が揃います。',
    'Punchlist is for customer project issues. Support Center is for system, equipment, data and team coordination problems under its categories. || Punchlistは顧客プロジェクト課題用です。システム・機器・データ・社内調整の問題はSupport Centerの分類で報告します。'))

C('procurement', 'Procurement Dashboard and BOM || 購買DashboardとBOM', 'Procurement Dashboard / BOM || Procurement Dashboard / BOM', 'Purchasing / PM / material controllers || 購買・PM・資材管理',
  P('20.1 Read material queues and budgets || 20.1 資材の処理待ちと予算を見る', [
    'Open Procurement Dashboard and review live totals and queues within your permissions. || Procurement Dashboardで権限内の実データ集計と処理待ちを確認します。',
    'Distinguish Budget, Commitment and Actual before comparing; do not add the same underlying amount twice. || 予算、発注確約、実績を区別して比較し、同じ元金額を二重加算しないでください。',
    'Review pending PR approvals, open PO receipts and exceptions, then open the source module to act. || PR承認待ち、PO未入庫、例外を確認して元モジュールで処理します。'
  ], 'Each follow-up total or queue can be traced to its source documents. || フォロー対象の集計・待ち項目を元書類まで追跡できます。') +
  P('20.2 Generate and release a BOM || 20.2 BOMの生成とRelease', [
    'Open BOM → Generate BOM and select a project with an approved/locked estimate. || BOM → Generate BOMで承認済み・Locked見積を持つProjectを選びます。',
    'Verify estimate number/revision and generate the BOM. || 見積番号・版を確認してBOMを生成します。',
    'Open View and inspect modules, items, quantities, reference budgets, stock and shortages. || ViewでModule、項目、数量、参照予算、在庫、不足を確認します。',
    'An authorized user selects Release once complete, with any required note. || 完全性確認後、権限者が必要メモを付けてReleaseします。',
    'Use the released BOM as the source for PR and MIR. || Released BOMをPRとMIRの元データに使います。'
  ], 'The BOM is Released and its revision is frozen for purchase/issue work. || BOMがReleasedになり、購買・出庫用の版が固定されます。') +
  P('20.3 Reserve stock for a project || 20.3 プロジェクト用に在庫を引当', [
    'Open the BOM and compare Available stock with Remaining demand. || BOMで使用可能在庫と残需要を比較します。',
    'Use Reserve stock and enter an allowed quantity and required-use date. || Reserve stockで引当可能範囲の数量と使用予定日を入力します。',
    'Save and check changed Reserved, Available and Shortage values. || 保存後にReserved、Available、Shortageを確認します。',
    'If reserved material is no longer needed, coordinate with the material controller and use the supported reservation action. || 引当品が不要になった場合は資材管理者と調整し、対応する引当操作を使います。'
  ], 'The quantity is reserved for the project and excluded from stock freely available to other work. || 対象Projectに引当され、他案件の自由使用可能数量から除かれます。',
    'Reservation is not physical issue. MIR and Issue are required to record material leaving stock. || 引当は実出庫ではありません。持出記録にはMIRとIssue工程が必要です。'))

C('pr', 'Purchase Requisition: request and approve || Purchase Requisition：購買申請・承認', 'Purchase Requisition || Purchase Requisition', 'Requesters / Purchasing / routed approvers || 申請者・購買・指定承認者',
  P('21.1 Create a PR from a released BOM || 21.1 Released BOMからPRを作成', [
    'Open Purchase Requisition → New PR and select a Released BOM. || Purchase Requisition → New PRでReleased BOMを選びます。',
    'Set priority, required date and purpose. || 優先度、必要日、目的を設定します。',
    'Select purchase lines and review remaining demand, stock, purchase quantity, supplier and unit price. || 購入行を選び、残需要、在庫、購入数量、仕入先、単価を確認します。',
    'Check price sources, estimate budgets and variances. Supply required reasons for purchasing despite available stock or outside the plan. || 価格情報源、見積予算、差異を確認します。在庫がある購入や計画外購入には指定の理由を記入します。',
    'Save Draft and review all lines in detail before Submit. || Draft保存後、詳細で全行を確認してSubmitします。'
  ], 'The PR has a number and an approval route generated for its actual conditions. || PR番号と実際の条件に応じた承認経路が設定されます。',
    'The PR stock snapshot records conditions at that time. Current available stock can change through other work. || PRの在庫スナップショットはその時点の判断根拠です。現在の使用可能在庫は他の業務で変動します。') +
  P('21.2 Review a PR and track its decision || 21.2 PR審査と結果確認', [
    'Open the PR or Approvals and verify that Approval route is at your step. || PRまたはApprovalsで承認経路が自分の工程か確認します。',
    'Check estimate/module/BOM sources, suppliers, quantities, prices, variances and exceptional reasons. || 元見積・Module・BOM、仕入先、数量、価格、差異、特別理由を確認します。',
    'Choose the permitted Approve or Reject action and enter required comments. || 許可されたApprove・Rejectを選び、必須コメントを記入します。',
    'The requester reviews the result and follows the currently allowed correction workflow. || 申請者は結果を確認し、現状態で許可される修正手順に従います。',
    'Create a PO only after all approval steps are complete. || 全承認完了後にのみPOを作成します。'
  ], 'Every step records actor, time and explanation; all approval precedes PO creation. || 各工程に実施者・日時・説明が残り、PO作成前に承認が完了します。',
    'Requesters cannot approve their own PR. Variance, off-plan or stock conditions may add approvers; follow the document’s actual route. || 申請者は自分のPRを承認できません。差異・計画外・在庫条件で承認者が追加されるため、実書類の経路に従います。'))

C('historical-pr', 'Historical PR: import, archive and compare || 過去PR：取込・履歴保管・予算比較', 'Purchase Requisition → Historical PR || Purchase Requisition → Historical PR', 'Purchasing / authorized import and mapping users || 購買・取込・紐付け権限者',
  P('22.1 Import an existing PR workbook || 22.1 既存PRブックを取り込む', [
    'Use Import historical PR and select an original <b>.xlsx up to 8 MB</b> in the supported TOMAS PR format. || Import historical PRで対応TOMAS PR書式の原本 <b>.xlsx、8 MB以下</b> を選びます。',
    'Check Preview: Project Number, revision, preparer/date, item count and totals by status. || PreviewでProject Number、版、作成者・日付、件数、状態別合計を確認します。',
    'Read strike-through and cancelled PO lines correctly: strike-through means the PR was issued, not demand cancelled. || 取消PO行と取消線の意味を区別します。取消線はPR発行済みであり、需要取消ではありません。',
    'Confirm only after reconciliation, then review Source version and download the stored original. || 照合後に確定し、Source versionと保存原本のダウンロードを確認します。',
    'If the live project does not yet exist, authorized users may retain the original project number as Awaiting project link. || 実Projectが未登録なら、権限者が元番号でProject紐付け待ちとして保管できます。'
  ], 'The archive retains the original file and separately traceable source versions. || 元ファイルと追跡可能な版履歴が保管されます。',
    'Historical PR imports create no live PO, receipt, stock movement or new purchase demand. This importer uses the supported THB workbook format. || 過去PR取込は実PO、入庫、在庫移動、新規購入需要を作成しません。対応するTHB建てブック書式を使います。') +
  P('22.2 Link a project and map estimate costs || 22.2 Projectと原価項目を紐付け', [
    'Once the project exists, use Link Project; its number must match the original project number exactly. || Project登録後にLink Projectを使い、番号を原本と完全一致させます。',
    'Select the source version and map known rows to items/modules in the current estimate. || Source versionを選び、確認できた行を現在の見積Item・Moduleに紐付けます。',
    'Manually link replacement lines for cancelled POs using evidence from the same workbook. || 取消POの代替行は同じブックの証拠に基づいて手動で関連付けます。',
    'Review Approved, Pending, Cancelled and Unknown separately. Active amount = Approved + Pending. || Approved、Pending、Cancelled、Unknownを別々に確認します。有効金額＝Approved＋Pendingです。',
    'Save mappings. If the estimate revision is stale, reload and remap against the current revision. || 紐付けを保存します。見積版が古い場合は再読込し、現行版に再紐付けします。'
  ], 'Variance covers mapped Active rows in that document, with traceable history. || その書類の紐付け済み有効行の差異と履歴を確認できます。',
    'Blank actual cost means unknown, not zero. Blank/zero estimate budget does not prove overspend. A newly imported source version starts without mappings; this view is not total project expenditure. || 実績原価の空欄は不明であり0ではありません。予算の空欄・0だけで超過とは断定できません。新しい取込版の紐付けは初期化され、この画面はProject全支出ではありません。'))

C('po', 'Purchase Orders: issue and follow up || Purchase Orders：発注と納入追跡', 'Approved PR → Create PO / Purchase Orders || 承認済みPR → Create PO / Purchase Orders', 'Purchasing || 購買',
  P('23.1 Create purchase orders from an approved PR || 23.1 承認済みPRからPOを作成', [
    'Open an Approved PR and check that its items are ready for purchasing. || ApprovedのPRを開き、明細が発注可能か確認します。',
    'Select Create PO, enter expected delivery date and check suppliers. || Create POで納入予定日を入力し、仕入先を確認します。',
    'Confirm; the system splits purchase orders by supplier. || 確定すると仕入先ごとにPOが作成されます。',
    'Find the new POs in Purchase Orders and verify items, quantities, prices and expected receipt dates. || Purchase Ordersで作成POを検索し、明細、数量、価格、入庫予定日を確認します。',
    'Track ordered versus received quantities and hand over to receiving staff when goods arrive. || 発注・入庫済み数量を追跡し、到着時は入庫担当へ引き継ぎます。'
  ], 'Each PO links the correct PR and supplier and shows received/outstanding quantities. || 各POが正しいPR・仕入先に紐づき、入庫済み・未入庫数量を表示します。',
    'Creating a PO does not mean it was emailed or dispatched to the supplier. Use the company’s purchasing communication process. || PO作成だけではメール送信や仕入先への発注連絡は行われません。会社の購買連絡手順を実施します。'))

C('receiving', 'Goods Receiving: full and partial receipts || Goods Receiving：全量・分納入庫', 'Purchase Orders → Receive / Goods Receiving || Purchase Orders → Receive / Goods Receiving', 'Receiving staff / warehouse || 入庫担当・倉庫',
  P('24.1 Record a GRN for goods actually received || 24.1 実際の到着品でGRNを記録', [
    'Open the PO’s receive action and match PO number/supplier with the delivery note. || POの入庫操作を開き、納品書とPO番号・仕入先を照合します。',
    'Enter delivery note reference and received date. || 納品書番号と受領日を入力します。',
    'Enter actual received quantity for each line and split accepted versus damaged/rejected quantity as the form requires. || 各行の実受領数量を入力し、合格数量と破損・不合格数量を分けます。',
    'Check against outstanding receivable quantities and save the receipt draft. || 入庫可能残数量を超えていないか確認し、下書き保存します。',
    'Open Goods Receiving, inspect the GRN and use Confirm with the appropriate permission once inspection is complete. || Goods ReceivingでGRNを確認し、検品完了後に権限のある担当者がConfirmします。'
  ], 'Confirmed accepted goods enter stock, damaged goods enter quarantine and PO outstanding quantities are correct. || 確定後、合格品は在庫、破損品は隔離に入り、PO未入庫数量が正しく更新されます。',
    'A draft does not post stock. Record each actual delivery separately; do not receive the full order before it arrives. || 下書きでは在庫計上されません。分納ごとに実数を記録し、未到着分を先に入庫しないでください。') +
  P('24.2 Verify receipts and handle exceptions || 24.2 入庫後の確認と例外処理', [
    'Check Inventory balances against the confirmed GRN. Ask the material controller for event-level ledger investigation when needed. || Inventory残高と確定GRNを照合します。イベント別台帳の調査は資材管理者へ依頼します。',
    'Route quarantined goods to the Inventory Controller for Accept, Return to Supplier or Scrap. || 隔離品は在庫管理者へ回し、合格、仕入先返品、廃棄を判断します。',
    'For incorrect confirmed receipts, report PO/GRN numbers and facts to the controller, then use the permitted stock-correction process. || 確定入庫の誤りはPO・GRN番号と事実を管理者へ伝え、許可された在庫修正手順を使います。'
  ], 'Received and usable quantities remain distinct, with references for corrections. || 受領数量と使用可能数量が区別され、修正の参照記録が残ります。'))

C('inventory', 'Inventory: balances, adjustments and quarantine || 在庫：残高・調整・隔離品', 'Inventory → Stock Balances / Adjustments & Quarantine || Inventory → Stock Balances / Adjustments & Quarantine', 'Warehouse / controllers / stock readers || 倉庫・在庫管理者・閲覧権限者',
  P('25.1 Read balances and trace movements || 25.1 在庫残高と移動元を確認', [
    'Open Stock Balances and search item, part number, description or brand; use reorder filters when needed. || Stock Balancesで品目、部品番号、説明、ブランドを検索し、必要なら再発注対象を絞ります。',
    'Distinguish usable, quarantined, reserved, available and on-order quantities; inspect average cost and value. || 使用可能、隔離、引当済み、引当可能、発注中を区別し、平均単価と評価額を確認します。',
    'Trace a change through its source GRN, MIR, return or adjustment document. || 変動を元GRN、MIR、返却、調整書類まで追跡します。',
    'Ask the controller for detailed ledger events if needed; the current Stock Balances screen does not offer a ledger drill-down button. || 詳細イベント台帳が必要なら管理者へ依頼します。現行Stock Balances画面に台帳詳細ボタンはありません。'
  ], 'Balances agree with relevant source documents and are not confused with reservations. || 残高が元書類と一致し、引当と実出庫を混同していません。') +
  P('25.2 Request a stock-count adjustment || 25.2 棚卸差異の調整を申請', [
    'Count the actual item and document the difference and evidence before requesting an adjustment. || 実棚を確認し、差異と証拠を記録してから調整申請します。',
    'Open Adjustments &amp; Quarantine → adjustment action; choose item/location and enter signed quantity plus reason. || Adjustments &amp; Quarantineの調整操作で品目・場所を選び、増減符号付き数量と理由を入力します。',
    'Review positive/negative direction and submit for approval. || 増減方向を確認して承認申請します。',
    'Another authorized approver reviews the request. After approval, check the new balance and reference. || 別の権限者が審査します。承認後に残高と参照を確認します。'
  ], 'Stock changes through the approved adjustment with a reason and audit trail. || 理由と履歴付きの承認済み調整で在庫が変動します。',
    'Do not hide differences by editing master data or creating a false receipt/issue. || マスター変更や架空入出庫で差異を隠さないでください。') +
  P('25.3 Decide the disposition of quarantined goods || 25.3 隔離品の処置を決める', [
    'Open the quarantined receipt/lot and inspect quantity, condition and source GRN. || 隔離入庫・ロットを開き、数量、状態、元GRNを確認します。',
    'Choose Accept to usable stock, Return to Supplier or Scrap according to the actual decision and your permission. || 実際の判断と権限に従い、使用可能在庫へのAccept、仕入先返品、廃棄を選びます。',
    'Enter quantity and required reason/reference; review before confirming. || 数量、必須理由・参照を入力し、確認して確定します。',
    'Check the remaining quarantine and resulting usable stock or outbound movement. || 隔離残高と処理後の使用可能在庫・出庫を確認します。'
  ], 'The decision is traceable and quarantine is not treated as available material before acceptance. || 処置を追跡でき、合格処理前の隔離品を使用可能在庫に含めていません。'))

C('issues', 'Material Issues: request, issue, receive and return || 資材出庫：申請・払出・受領・返却', 'Material Issues || Material Issues', 'Requesters / approvers / warehouse / recipients || 申請者・承認者・倉庫・受領者',
  P('26.1 Request material with an MIR || 26.1 MIRで資材を申請', [
    'Open Material Issues → New MIR and select the project/released BOM. || Material Issues → New MIRでProject・Released BOMを選びます。',
    'Set the required date, recipient or purpose as offered and select material lines. || 必要日、受領者、用途などを入力し、資材行を選びます。',
    'Check remaining demand, available/reserved stock and request quantities. || 残需要、使用可能・引当在庫、申請数量を確認します。',
    'Submit and record the MIR number and approval state. || 提出し、MIR番号と承認状態を確認します。'
  ], 'The request references the correct BOM and waits for authorized approval. || 正しいBOMに紐づく申請が権限者の承認待ちになります。') +
  P('26.2 Approve, issue and acknowledge receipt || 26.2 承認・払出・受領確認', [
    'The approver checks purpose, quantities and stock before approving or rejecting with required comments. || 承認者は用途、数量、在庫を確認し、必要コメント付きで承認・却下します。',
    'Warehouse opens the approved MIR, prepares the permitted quantity and checks item/recipient against the physical handover. || 倉庫は承認済みMIRで数量を準備し、実際の引渡しと品目・受領者を照合します。',
    'Use Issue to post the actual outbound quantity and inspect the updated balance. || Issueで実払出数量を計上し、在庫更新を確認します。',
    'The actual authorized recipient confirms receipt through the MIR. || 実際の権限のある受領者がMIRで受領確認します。'
  ], 'Approval, warehouse issue and recipient acknowledgement are separately traceable. Inspect Chain of custody for requester, approver, issuer, recipient and times. || 承認、倉庫払出、受領者確認を個別に追跡できます。Chain of custodyで申請者、承認者、払出者、受領者、日時を確認します。',
    'Requesters cannot approve their own MIR. Issue and confirmation of receipt are separate events. || 申請者は自分のMIRを承認できません。払出と受領確認は別のイベントです。') +
  P('26.3 Return unused material || 26.3 未使用資材を返却', [
    'Open the original MIR and verify issued, received and already returned quantities. || 元MIRで払出、受領、返却済み数量を確認します。',
    'Use the supported Return action with actual item, quantity and reason. || Returnで実際の品目、数量、理由を記録します。',
    'Return no more than the remaining net issued quantity and complete the warehouse confirmation required by the screen. || 純払出残数量を超えない範囲で返却し、画面で必要な倉庫確認を完了します。',
    'Check returned totals and stock against the original MIR. || 返却合計と在庫を元MIRに照合します。'
  ], 'The custody chain remains intact from request through return. || 申請から返却までの受渡し履歴が維持されます。'))

C('approvals', 'Approvals: central material queue || Approvals：資材承認の共通窓口', 'Approvals || Approvals', 'Authorized procurement approvers / inventory controllers || 購買承認権限者・在庫管理者',
  P('27.1 Process the central approval queue || 27.1 共通承認待ちを処理', [
    'Open Approvals and review the available PR, material issue and stock-control requests for your role. || Approvalsで役割に応じたPR、出庫、在庫管理の申請を確認します。',
    'Open the source document, review quantities, budgets, reasons and the current approval step. || 元書類を開き、数量、予算、理由、現在の承認工程を確認します。',
    'Approve or reject only when you are the authorized actor, entering the required explanation. || 自分が権限のある処理者の場合のみ承認・却下し、必須説明を入力します。',
    'Refresh the queue and verify source-document status and history. || 一覧を再読込し、元書類の状態と履歴を確認します。'
  ], 'Only eligible requests are processed and each decision is recorded at its source. || 対応権限のある申請が処理され、元書類に判定が記録されます。',
    'This is a material approval queue. Estimate, resource plans, reports and digital signatures keep their own review/approval screens. || この画面は資材承認用です。見積、リソース計画、報告書、電子署名はそれぞれの審査・承認画面を使います。'))

C('knowledge', 'Knowledge Hub: find and control team knowledge || Knowledge Hub：チームの知識を検索・管理', 'Knowledge Hub || Knowledge Hub', 'Employees / document owners / reviewers / publishers || 従業員・書類責任者・審査者・公開担当',
  P('28.1 Find solutions and reusable documents || 28.1 ソリューションと再利用資料を探す', [
    'Open Solutions &amp; Sales Materials. Search solution, document or filename and filter language/format. || Solutions &amp; Sales Materialsでソリューション、資料名、ファイル名を検索し、言語・形式で絞ります。',
    'Open the relevant category and its SharePoint file; verify source permissions and revision before use. || 分類からSharePointファイルを開き、利用前に元ファイルの権限と版を確認します。',
    'Use Standards Register to search controlled documents by number, title, tag, owner or category. || Standards Registerでは管理文書を番号、名称、タグ、責任者、分類で検索します。',
    'Filter type, status, category, confidentiality, language or review due date, then open details. || 種類、状態、分類、機密区分、言語、見直し期限で絞り、詳細を開きます。',
    'Read the published revision, download permitted files and inspect Revision History before citing them. || 公開版を読み、権限のあるファイルをダウンロードしてRevision Historyを確認してから引用します。'
  ], 'The document suits the work and its owner/current revision are known. || 業務に適した資料と、その責任者・使用版が明確です。',
    'Sales Materials is an index of source links, not proof every file is current. App access does not grant additional SharePoint access. || Sales Materialsは元ファイルへの索引で、全ファイルが最新版とは限りません。アプリ利用権限でSharePoint権限が増えることはありません。') +
  P('28.2 Create, review and publish a controlled document || 28.2 管理文書を作成・審査・公開', [
    'Authorized users create a Standards Register document with number/title, type, category, owner, language, confidentiality and required metadata. || 権限者がStandards Registerで番号・名称、種類、分類、責任者、言語、機密区分、必須情報を登録します。',
    'Create/upload a revision with change type, change summary and effective/review dates as offered. || 改訂種別、変更概要、適用・見直し日を設定して版を作成・アップロードします。',
    'Open the revision and submit for Review. Designated reviewers read and record decisions at the shown steps. || 版を開いてReviewへ提出し、担当者が表示手順で内容確認と判定を記録します。',
    'Authorized publishers Publish only when conditions are satisfied and assign required acknowledgements when needed. || 条件を満たした版を公開権限者がPublishし、必要なら確認対象者を指定します。',
    'Create a new revision for content changes. Archive obsolete documents with the required reason and permission. || 内容変更は新版を作り、不要文書は権限と理由に従ってArchiveします。'
  ], 'The register identifies the current published revision and preserves earlier versions separately from drafts. || 現在の公開版を識別でき、旧版と下書きが区別されて保管されます。') +
  P('28.3 Presentations, articles and collaboration || 28.3 提案資料・技術記事・共同作業', [
    'Use Presentation Library to find/open presentations or upload with metadata when allowed. || Presentation Libraryで資料を検索・閲覧し、権限があれば管理情報付きでアップロードします。',
    'Use Technical Knowledge to find/write how-to articles, lessons learned and troubleshooting instructions. || Technical Knowledgeで手順、教訓、問題解決の記事を検索・作成します。',
    'Open Shared &amp; Project items to read comments and contribute within your access. || Shared &amp; Projectで共有・Project関連情報を開き、権限内でコメント確認・共同編集します。',
    'Use the offered bookmarks, comments and related-work links for later reference and coordination. || Bookmark、コメント、関連業務リンクを活用して参照・調整します。'
  ], 'Knowledge and files are in appropriate categories with a reusable source context. || 知識とファイルが適切に分類され、再利用のための情報源が残ります。') +
  P('28.4 Acknowledge documents and refresh the library || 28.4 文書確認とライブラリー更新', [
    'Open My Acknowledgements, read the assigned revision and acknowledge it yourself. || My Acknowledgementsで指定版を読み、本人が確認済みにします。',
    'Administrators maintain the categories/control data available in Knowledge Admin. || 管理者はKnowledge Adminで提供される分類・管理情報を保守します。',
    'Sales Materials maintainers use Auto update. Production requests the displayed Microsoft read permission; Team Test uses the latest downloaded XLSX. || Sales Materials管理者はAuto updateを使います。Productionは表示されたMicrosoft読取権限、Team Testは最新のダウンロード済みXLSXを使用します。',
    'Review the comparison before publishing an updated index for the team. || 比較内容を確認してから更新索引を公開します。'
  ], 'Acknowledgement identifies both person and revision; library updates are reviewed. || 確認者と文書版が記録され、ライブラリー更新が確認済みになります。') +
  P('28.5 Manage access, related records and comments || 28.5 権限・関連レコード・コメントを管理', [
    'In document details → Related records, add/remove permitted links after checking source type and record number. || 詳細のRelated recordsで元種類と番号を確認してから許可されたリンク追加・削除を行います。',
    'Use Comments to add/reply and manage threads through the actions available to you. || Commentsで投稿・返信し、権限に応じたスレッド操作を行います。',
    'Authorized managers open Access, choose User, Department or Project and a level: View, Download, Comment, Edit, Review, Approve or Manage. || 管理権限者はAccessでUser・Department・Projectと、View・Download・Comment・Edit・Review・Approve・Manageの権限を選びます。',
    'Check the recipient and level before Grant access; revoke the correct row when no longer needed. || Grant access前に対象と権限を確認し、不要になった権限は正しい行から撤回します。',
    'Use Audit for history and Helpful / Not helpful on articles to give feedback from actual use. || Auditで履歴を確認し、記事のHelpful・Not helpfulで利用に基づく評価を行います。'
  ], 'Links, discussions and access match the document’s purpose. || 関連、議論、権限が文書の用途に合っています。',
    'Project ID in access grants means the system record ID. If unknown, ask the administrator rather than guessing from the PJ number. || 権限付与のProject IDはシステム内部のレコードIDです。不明なら管理者に確認し、PJ番号から推測しないでください。') +
  P('28.6 Maintain working documents, categories and numbering || 28.6 作業文書・分類・採番を管理', [
    'For Working documents, use offered Editing / Shared / Final states according to file readiness. || Working文書では完成度に応じてEditing・Shared・Finalを使います。',
    'Authorized users can Restore archived documents with a reason, then verify the usable revision. || 権限者は理由付きでArchive文書をRestoreし、参照可能な版を確認します。',
    'In Knowledge Admin, add/edit categories with parent, order, multilingual names, default type and Active state. || Knowledge Adminで親分類、順序、多言語名称、既定種類、Activeを設定して分類を追加・編集します。',
    'In Document number sequences, maintain prefix, scope, description, last number, padding and state. Existing sequence numbers can only move forward. || Document number sequencesでPrefix、Scope、説明、最終番号、桁数、状態を管理します。既存番号は前進方向にのみ変更できます。'
  ], 'The library structure and numbering remain usable and consistent. || ライブラリー構成と採番の連続性が維持されます。',
    'Do not use Superseded, Archived or Expired documents as the basis for new work; find the effective revision. || 新規業務ではSuperseded・Archived・Expiredを根拠にせず、有効版を探します。'))

C('signature', 'Personal signatures and company stamps || 個人署名と社印の設定', 'User menu → My signature / Company Stamps || ユーザーメニュー → My signature / Company Stamps', 'Signers / authorized stamp administrators || 署名者・社印管理権限者',
  P('29.1 Prepare your own signature specimen || 29.1 自分の署名見本を準備', [
    'Open My signature and check for your Active specimen. || My signatureで自分のActive署名見本を確認します。',
    'Use Create / Replace to draw, upload or type your name using the offered methods. Verify that it is legible and your own mark. || Create・Replaceで描画、アップロード、氏名入力の方法を使い、判読可能な自分の署名か確認します。',
    'Add initials or a short signature for drawing title blocks if needed, then Save specimen. || 必要なら図面枠用のイニシャル・略式署名を追加し、Save specimenします。',
    'Use supported specimen-management actions for changes; subsequent signing uses the Active specimen. || 変更は見本管理操作を使います。次回以降の署名にはActiveの見本を使います。'
  ], 'Your Active specimen is ready for your own signing steps. || 自分の署名工程で使うActive見本が用意されています。',
    'Saving a specimen does not sign a document or replace signatures in previously signed evidence. || 見本保存は書類への署名ではなく、過去の署名証拠の画像も変更しません。') +
  P('29.2 Register company stamps and check authority || 29.2 社印登録と使用権限の確認', [
    'Open Company Stamps and inspect stamp records and status. || Company Stampsで社印一覧と状態を確認します。',
    'Authorized users use New stamp to register the company-assigned stamp and image. Grant/revoke authority are separate stamp actions. || 権限者はNew stampで会社から指定された印と画像を登録します。使用権限の付与・撤回は別操作です。',
    'Before stamping, check authorized person, document classes and validity period. || 押印前に権限者、書類種類、有効期間を確認します。',
    'If a stamp or authority is unavailable, contact the administrator; do not substitute another stamp merely to pass submission. || 印や権限がない場合は管理者へ連絡し、提出条件を通す目的で別印を代用しないでください。'
  ], 'Stamps are used only by authorized people and within the granted scope. || 権限のある本人が付与範囲内で社印を使用します。',
    'Admin does not automatically carry business stamping authority. Flows that do not require a stamp can proceed without one. || Admin権限だけでは業務上の押印権限は得られません。社印不要のフローでは未選択で進められます。') +
  P('29.3 Grant/revoke stamp authority and read signature flows || 29.3 社印権限の付与・撤回と署名フロー確認', [
    'Users authorized to Grant open the correct stamp and select a grantee, document scope and validity, then save. || Grant権限者が正しい社印を開き、付与相手、書類範囲、有効期間を設定して保存します。',
    'To revoke, choose that person’s row, use Revoke with a reason and verify state. || 撤回時は対象者の行でRevokeと理由を記録し、状態を確認します。',
    'Read Signature flows for document class, template version, mandatory blocks, ordered/any-order steps and distinct-person rules. || Signature flowsで書類種類、Template版、必須署名欄、順次・順不同、同一人物禁止条件を確認します。',
    'Request flow changes from the responsible administrator; this tab is a reference view, not a template editor. || フロー変更は担当管理者へ依頼します。このタブは参照画面でありTemplate編集画面ではありません。'
  ], 'You know who can stamp and the required steps for each class. || 押印できる人と書類種類ごとの必須工程が分かります。',
    'An existing request uses the template version captured for its round; a newer template does not immediately rewrite pending requests. || 進行中の依頼はその回のTemplate版を使い、新Templateが承認待ち依頼を即座に書き換えることはありません。'))

C('signing', 'Sign Inbox and Signed Documents || Sign InboxとSigned Documents', 'Sign Inbox / Signed Documents || Sign Inbox / Signed Documents', 'Named preparers / reviewers / approvers || 指定された作成者・審査者・承認者',
  P('30.1 Sign at your own step || 30.1 自分の工程で署名', [
    'Open Sign Inbox and a request at your step. Check document number, project, revision and previous signers. || Sign Inboxで自分の工程の依頼を開き、番号、Project、版、前の署名者を確認します。',
    'Read the full source file. Use Preview, move &amp; resize signature when placement is needed. || 原本を全て読み、配置が必要ならPreview, move &amp; resize signatureを開きます。',
    'Choose the page and drag/resize the signature box or enter coordinates. Arrow keys move it; Shift + arrows resize it. || ページを選び、枠を移動・拡縮または座標入力します。矢印キーは移動、Shift＋矢印はサイズ変更です。',
    'If this step grants stamp authority, select and position the stamp separately. Verify page/positions and use Use these positions. || この工程で社印権限がある場合は印を別途選んで配置し、ページ・位置を確認してUse these positionsを押します。',
    'Read the consent and select SIGN DOCUMENT only when ready. Return incorrect content with the required reason. || 同意内容を読み、準備できたらSIGN DOCUMENTを実行します。不備があれば理由付きで差し戻します。'
  ], 'Your identity/time is recorded and the request moves to the next step or completion. || 本人と日時が記録され、次工程または完了へ進みます。',
    'Use these positions confirms placement only. Positioned signing supports readable PDF/PNG/JPEG, with PDFs of 1–200 pages. Obtain a supported source if encrypted, unreadable or externally digitally signed. || Use these positionsは位置確定だけで、署名ではありません。読取可能なPDF・PNG・JPEG、PDFは1～200ページが対象です。暗号化、読取不可、外部電子署名付きの場合は適切な元ファイルを用意します。') +
  P('30.2 Inspect signed files and history || 30.2 署名済みファイルと履歴を確認', [
    'Search Signed Documents by document/project and check status. || Signed Documentsで番号・Projectを検索し、状態を確認します。',
    'Open details for file revision, request rounds, signers and evidence. || 詳細でファイル版、依頼回、署名者、証拠を確認します。',
    'After mandatory steps finish, use View signed file and download; check Downloads. || 必須工程完了後にView signed fileで表示・ダウンロードし、Downloadsを確認します。',
    'Read earlier rounds or use the document’s verification code/link to inspect the record in the system. || 過去の回を確認するか、書類の検証コード・リンクでシステム記録を確認します。'
  ], 'The output and evidence correspond to the intended revision and completed state. || 出力と証拠が意図した版・完了状態に一致します。',
    'Some older outputs are HTML certificates; positioned rounds produce PDF outputs with an appendix. Completed signatures cannot be repositioned; use a new revision and round. || 旧出力にはHTML証明書があり、位置指定する回では付録付きPDFを作成します。完了署名は位置変更できず、新版・新しい回が必要です。') +
  P('30.3 Import and release a design drawing || 30.3 設計図面を取り込んで承認発行', [
    'The PM prepares a leaf Design task in Project Schedule and assigns its Member/PIC. || PMがProject Scheduleに末端のDesign Taskを用意し、Member・PICを割り当てます。',
    'The assigned member opens the row → Import Drawing, selects a supported PDF/image/project file and freezes its revision. || 担当者が行のImport Drawingから対応PDF・画像・Projectファイルを選び、版を固定します。',
    'Open the new drawing in Signed Documents → Request signatures and check named signers and any stamp. || Signed Documentsの新図面でRequest signaturesを選び、指定署名者と必要な社印を確認します。',
    'The preparer signs Drawn by, project Lead engineer signs Checked by, then project Manager signs Approved by. || 作成者がDrawn by、ProjectのLead engineerがChecked by、ManagerがApproved byの順に署名します。',
    'If returned, the preparer imports a replacement revision and starts a new round; verify all three completed steps. || 差し戻し時は作成者が代替版を取り込み、新しい回を開始します。3工程すべての完了を確認します。'
  ], 'The drawing links its task/project and has three different named signers. || 図面がTask・Projectに紐づき、異なる指定3名の署名が揃います。',
    'All three must be Active with valid rights/specimens. Lead engineer and Manager are the people named on the project, not any user with the same role title. || 3名ともActiveで有効な権限・署名見本が必要です。Lead engineer・ManagerはProjectに指定された本人であり、同じ役割名の別ユーザーではありません。') +
  P('30.4 Freeze other documents and request signatures || 30.4 その他の書類を固定して署名依頼', [
    'Store the original under Project → Documents, then use the authorized create/Freeze action in Signed Documents. || 原本をProject → Documentsに保管し、Signed Documentsで権限のある作成・Freeze操作を使います。',
    'Select Project, Stored file, Document class, Revision and Title. Drawings also require My Design task. || Project、Stored file、Document class、Revision、Titleを選びます。DrawingはMy Design taskも必要です。',
    'Use Freeze document, open its details and select Request signatures. || Freeze documentで版を固定し、詳細からRequest signaturesを選びます。',
    'Check template steps and permitted signer/stamp options, then submit the request. || Templateの工程と許可された署名者・社印選択を確認し、依頼を送信します。',
    'Track details/Sign Inbox until complete; use New revision with a reason when the source file must change. || 詳細・Sign Inboxで完了まで追跡し、原本変更時は理由付きNew revisionを使います。'
  ], 'The signing file is frozen to a revision and a round has responsible people. || 署名対象が版固定され、担当者のある依頼回が始まります。',
    'Freeze is not signing, and requesting signatures is not approval. Each document class can use a different flow from Drawing. || Freezeは署名ではなく、署名依頼は承認ではありません。書類種類によりDrawingと異なるフローを使います。') +
  P('30.5 Return, reject, delegate and attach paper signatures || 30.5 差し戻し・却下・委任・紙署名添付', [
    'Use Return with a reason for corrections; use Reject only when authorized and appropriate to the actual decision. || 修正は理由付きReturn、却下は権限と実際の判断に応じたRejectを使います。',
    'Where Delegate is supported, select an eligible replacement, record a reason and verify the new assignee. Never use another person’s account to sign. || Delegate対応工程では適格な引継ぎ先と理由を設定し、新担当者を確認します。他人のアカウントで署名しないでください。',
    'For Signed on paper steps, store a scan of the actually signed paper in Project Documents. || Signed on paper工程では実際に署名された紙のスキャンをProject Documentsに保存します。',
    'Open the Paper step, choose the correct scan and signer information, then Attach signed scan. || Paper工程で正しいスキャンと署名者情報を選び、Attach signed scanします。',
    'Inspect step history and completion. For verification, open Signed Documents → Verify a code, enter the code and Verify. || 工程履歴と完了を確認します。検証はSigned Documents → Verify a codeでコードを入力し、Verifyします。'
  ], 'Decisions, delegation and paper evidence remain tied to the document round. || 判定、委任、紙の証拠が対象書類の回に紐づきます。',
    'Delegate is limited by flow; drawing named-signer rules still apply. An unsigned scan is not signing evidence. || 委任はフローで制限され、図面の指定署名者ルールは継続します。未署名のスキャンは署名証拠にはなりません。'))

C('reports', 'Reports: five operational report types || Reports：5種類の業務報告書', 'Reports → Report workspace || Reports → Report workspace', 'Preparers / reviewers / approvers || 作成者・審査者・承認者',
  T(['Type || 種類', 'Source || 元案件', 'Record || 記録内容'], [
    ['Installation || 設置', 'Project || Project', 'Hardware, software, commissioning checks and installation results. || ハード・ソフト、試運転確認、設置結果。'],
    ['UAT || 受入試験', 'Project || Project', 'Scenarios, test steps, expected/actual results, evidence and punchlist. || シナリオ、試験手順、期待・実測結果、証拠、残課題。'],
    ['Service || サービス', 'Project || Project', 'Symptoms, impact, cause, hardware/software repairs, downtime, backup, rollback and verification. || 症状、影響、原因、ハード・ソフト修正、停止時間、バックアップ、復旧、検証。'],
    ['Inspection || 点検', 'Inquiry or Project || InquiryまたはProject', 'Inspection points, targets, measured values, units, results and corrective actions. || 点検箇所、目標、測定値、単位、結果、是正。'],
    ['POC || 概念実証', 'Inquiry || Inquiry', 'Hypothesis, success criteria, baseline, trial method, results and limitations. || 仮説、成功基準、基準値、実験方法、結果、制約。']
  ]) +
  P('31.1 Create and complete a report || 31.1 報告書を作成・入力', [
    'Open Reports and choose a form/New report or a team template. || Reportsでフォーム・New reportまたはチームTemplateを選びます。',
    'Choose the correct Inquiry/Project and document language. Verify customer, End user, site, contact and work date. || 正しいInquiry・Projectと文書言語を選び、顧客、End user、現場、連絡先、作業日を確認します。',
    'Enter team, objective, type-specific content, summary, evidence references, pending actions, deliverables and remarks. || チーム、目的、種類別内容、概要、証拠参照、残アクション、成果物、備考を入力します。',
    'Add repeated rows for actual scenarios/steps or inspection points. Leave unperformed actual results and test outcomes blank. || 実際のシナリオ・手順・点検箇所に応じて行を追加します。未実施の実測・判定は空欄にします。',
    'In Team &amp; approvals, choose an optional reviewer and required approver, all distinct from the preparer and one another, then Save draft. || Team &amp; approvalsで任意のReviewerと必須Approverを指定し、作成者を含め別人であることを確認して下書き保存します。'
  ], 'The draft has the correct source, report type, language and approval team. || 下書きの元案件、種類、言語、承認チームが正しいことを確認します。',
    'Evidence fields store reference numbers/links, not image uploads. Store evidence in an accessible work location and reference it. || Evidence欄は番号・リンクを保存し、画像を直接アップロードする欄ではありません。審査者が開ける業務保存先に証拠を置いて参照します。') +
  P('31.2 Submit, review and approve || 31.2 提出・審査・承認', [
    'Check required/type-specific Content and preview the report. || 必須項目と種類別Contentを確認し、報告書をプレビューします。',
    'The preparer needs an Active signature. Read consent and Submit to sign this draft snapshot. || 作成者はActive署名が必要です。同意を読み、Submitでこの下書きスナップショットに署名します。',
    'The named reviewer performs the optional review step; then the named approver reads and signs approval. || 指定Reviewerが任意の審査工程を行い、その後指定Approverが内容を読んで承認署名します。',
    'For changes, reviewer/approver returns with a reason; the preparer creates the allowed new revision and corrects it. || 修正時は審査者・承認者が理由付きで差し戻し、作成者が許可された新版を作って修正します。',
    'Use History to verify the sequence and decisions. || Historyで順序と判定を確認します。'
  ], 'The Approved report contains content and internal signatures from the same revision. || Approved報告書の内容と社内署名が同じ版に属しています。',
    'Approved content cannot be directly edited; old signatures do not transfer to a new revision. If a previous signer has lost eligibility, start a revision and select currently eligible people before submitting. || 承認済み内容は直接編集できず、旧署名は新版へ移りません。旧署名者が権限を失った場合は新版で現在の適格者を選んで提出します。') +
  P('31.3 Print or export the correct report language || 31.3 正しい文書言語で印刷・出力', [
    'Open the report and verify its saved Document language and revision. || 報告書の保存済みDocument languageと版を確認します。',
    'Use Preview / Print and inspect headings, figures, dates and text. || Preview・Printで見出し、数値、日付、文章を確認します。',
    'Choose a printer or Save as PDF, and verify the output file before sharing. || プリンターまたはPDF保存を選び、共有前に出力を確認します。'
  ], 'The output matches the saved report revision and document language. || 保存済み報告書の版・文書言語に出力が一致します。',
    'Report document language is separate from application interface language; changing TH/EN/JP in the app does not rewrite an approved report. || 報告書の文書言語とアプリ表示言語は別です。アプリのTH・EN・JPを変えても承認済み報告書は書き換わりません。'))

C('report-templates', 'Report templates and customer acceptance || 報告書Templateと顧客確認', 'Reports → Team templates / Customer signing || Reports → Team templates / Customer signing', 'Preparers / approvers / customer representatives || 作成者・承認者・顧客代表',
  P('32.1 Create and use a team template || 32.1 チームTemplateを作成・使用', [
    'Create in Reports → Templates or open a report and Save as template. || Reports → Templatesで作成するか、報告書のSave as templateを使います。',
    'Name it and keep reusable objectives, test steps, expected results, inspection points and deliverables. || 名前を付け、再利用する目的、試験手順、期待結果、点検箇所、成果物を残します。',
    'Manually review and remove customer-specific wording from instructions before saving. || 保存前に案内文を確認し、顧客固有の文言を手動で削除します。',
    'Use template or choose it in New report, preview it and select current source work and approvers. || Use templateまたはNew reportで選び、プレビューして今回の元案件と承認者を指定します。',
    'Owners/authorized users can edit or Archive templates. Existing reports retain their own content and source-template version. || 責任者・権限者は編集・Archiveできます。既存報告書の内容と参照Template版は維持されます。'
  ], 'New reports reuse the structure without carrying old actual results or acceptance. || 旧案件の実測結果・確認を引き継がず、構成を再利用できます。',
    'Templates strip actual PASS/FAIL, site dates, participants, evidence, issues and signatures. Instructional free text still needs review. This is not Excel page-layout import. || Templateは実測PASS・FAIL、現場日付、参加者、証拠、問題、署名を除外しますが、自由入力の指示文は確認が必要です。Excelページレイアウトの取込ではありません。') +
  P('32.2 Create a customer acceptance link || 32.2 顧客確認リンクを作成', [
    'Open an Approved report → Customer signing. || Approved報告書のCustomer signingを開きます。',
    'The preparer or approver creates an expiring link and verifies revision/expiry. || 作成者または承認者が期限付きリンクを作り、版と有効期限を確認します。',
    'Copy and send the link to the responsible customer representative through the agreed channel; verify that the recipient can reach the app network/URL. || 合意した連絡経路で担当顧客代表へ送り、アプリのネットワーク・URLへ到達できることを確認します。',
    'The customer reads the report, enters name, position, company and date, gives consent, then acknowledges or draws a signature as offered. || 顧客は報告書を読み、氏名、役職、会社、日付、同意を入力して確認または描画署名します。',
    'The preparer checks Completed status and acceptance evidence. || 作成者がCompletedと確認証拠を確認します。'
  ], 'Customer acceptance is bound to the approved revision and is not retrospectively edited. || 顧客確認が承認版に紐づき、後から書き換えられません。',
    'Links are single-use. Creating a new link revokes the previous unused link. LAN Team Test links require network access. The entered representative identity is self-declared, not verified through the customer’s Microsoft account. || リンクは1回限りです。新リンク作成で未使用の旧リンクは無効になります。LANのTeam Testは到達可能なネットワークが必要です。代表者情報は本人入力であり、顧客Microsoftアカウントによる本人確認ではありません。') +
  P('32.3 Revoke links and void obsolete reports || 32.3 リンク撤回と報告書の無効化', [
    'When offered in Customer signing, use Revoke customer link to stop use of the existing link. || Customer signingで操作可能ならRevoke customer linkで旧リンクを撤回します。',
    'Authorized users may Void report with a reason after checking report number/revision. || 権限者は番号・版を確認し、理由付きVoid reportを実行できます。',
    'Verify status and History. For corrected output, use Create a new revision when allowed. || 状態とHistoryを確認します。修正版は許可されたCreate a new revisionを使います。',
    'During Review report, reviewers may select Apply my signature to the review when eligible and consenting. || Review reportでは、資格と同意がある審査者がApply my signature to the reviewを選べます。'
  ], 'Revoked links or void reports are explicit, with reasons and earlier evidence preserved. || 撤回・無効状態と理由が明確になり、過去の証拠が残ります。'))

C('analytics', 'Reports: analytics || Reports：分析レポート', 'Reports → View report analytics || Reports → View report analytics', 'Users with report and source-module access || レポート・元モジュール権限者',
  P('33.1 Read and export analytics || 33.1 分析を確認・出力', [
    'Open report analytics and choose a tab available to your account. || 分析レポートを開き、アカウントに表示されるタブを選びます。',
    'Set the offered filters, project or period and wait for complete loading. || フィルター、Project、期間を設定して読込完了を待ちます。',
    'Use Inventory Value for stock value, Supplier Performance for suppliers, PR Cycle Time for approval duration and Project Cost for project costs. || 在庫評価はInventory Value、仕入先はSupplier Performance、承認期間はPR Cycle Time、案件原価はProject Costを使います。',
    'Read the amount definitions and data period before comparing. Empty data calls for checking filters/access, not automatically assuming zero. || 比較前に金額の意味と対象期間を確認します。空欄はフィルター・権限を確認し、自動的に0と解釈しません。',
    'Use Export / Print where offered, then inspect the file/page and selected scope before sharing. || 提供されるExport・Printを使い、共有前にファイル・ページと対象条件を確認します。'
  ], 'The report matches the intended scope and traces to source documents. || 対象範囲が正しく、元書類まで追跡できます。',
    'This release has four analytics tabs subject to permissions, not the thirteen reports listed in an old prototype specification. || この版の分析は権限に応じた4タブで、旧試作仕様の13レポートとは異なります。'))

C('performance', 'KPI & Growth: self-review and development || KPI & Growth：自己評価と能力開発', 'KPI & Growth || KPI & Growth', 'Employees / managers in Engineering or Sales frameworks || 従業員・EngineeringまたはSalesの評価管理者',
  P('34.1 Complete your self-review || 34.1 自己評価を行う', [
    'Select your review cycle and check the Engineering or Sales framework assigned by your primary role. || 評価期間を選び、主役割に応じたEngineering・Salesの評価基準を確認します。',
    'Read Work Evidence from the cycle, inspect sources and choose evidence explaining your actual contribution. || 期間内のWork Evidenceと元データを読み、自分の実際の貢献を説明できる証拠を選びます。',
    'Enter whole-number ratings 1–5 for each area with evidence and summary. Ratings 1, 2 and 5 require specific evidence. || 各項目を整数1～5で評価し、証拠・概要を記入します。1・2・5には具体的証拠が必須です。',
    'Save incomplete Draft work and return to finish it before submitting. || 途中のDraftを保存し、提出前に不足を埋めます。',
    'Once all criteria/evidence are complete, submit Self review to Manager review and track state. || 全項目・証拠が揃ったらSelf reviewからManager reviewへ提出し、状態を追跡します。'
  ], 'Draft data persists and submission succeeds only with required content. || 下書きが保持され、必須内容を満たすと提出できます。',
    'An unrated area is a dash, not zero. Work Evidence supports decisions but does not assign the final human rating. || 未評価は「—」であり0ではありません。Work Evidenceは判断支援であり、最終評価を自動決定しません。') +
  P('34.2 Manager review and calibration || 34.2 管理者評価と調整', [
    'Open permitted employees in the cycle and check authority over their framework. || 期間内の許可された従業員を開き、その評価基準を管理できるか確認します。',
    'Read Self review and Work Evidence. Enter independent manager ratings; fields start blank rather than copying self-ratings. || 自己評価と証拠を読み、独立して管理者評価を入力します。初期値は空欄で、本人点数の自動コピーではありません。',
    'Save Draft during review, then submit to Calibration when complete. || 審査途中はDraft保存し、完成後Calibrationへ提出します。',
    'Record calibration conclusions and Complete assessment within your permission. Another manager must complete your own assessment. || 調整結果を記録し、権限内でComplete assessmentします。自分の評価完了は別の管理者が行います。',
    'Verify Completed. Closed cycles and completed assessments are read-only; employees see manager scores after completion. || Completedを確認します。閉鎖期間・完了評価は閲覧専用で、本人は完了後に管理者点数を見られます。'
  ], 'Final scores, conclusions and responsible reviewers are recorded. || 最終点数、結論、評価担当者が記録されます。') +
  T(['Engineering || 技術職', 'Weight || 比重', 'Sales || 営業職', 'Weight || 比重'], [
    ['Delivery reliability || 納期の信頼性', '35% || 35%', 'Pipeline &amp; conversion || 案件パイプライン・成約', '30% || 30%'],
    ['Engineering quality || 技術品質', '25% || 25%', 'Customer engagement || 顧客対応', '25% || 25%'],
    ['Technical contribution || 技術的貢献', '25% || 25%', 'Forecast discipline || 予測管理', '20% || 20%'],
    ['Ownership &amp; teamwork || 主体性・チームワーク', '15% || 15%', 'Commercial ownership || 商務責任', '15% || 15%'],
    ['— || —', '— || —', 'Handover &amp; teamwork || 引継ぎ・チームワーク', '10% || 10%']
  ]) + N('Estimate totals used as Sales KPI context are recorded costs, not sales or margin. Sparse evidence may produce no suggested rating. Support recognition does not automatically add KPI points. || Sales KPIの参考見積額は記録原価であり、売上・利益率ではありません。証拠不足では推奨点数が表示されない場合があります。Support感謝ポイントはKPIに自動加算されません。'))

C('support', 'Support Center: report and follow up || Support Center：問題報告と回答追跡', 'Top bar → Report a problem / Support Center || 上部バー → Report a problem / Support Center', 'All employees / category owners || 全従業員・分類担当者',
  P('35.1 Report a problem from your current screen || 35.1 使用中の画面から問題を報告', [
    'Select Report a problem in the top bar. The form preserves your source screen. || 上部のReport a problemを押すと元画面を保持したままフォームが開きます。',
    'Choose Application, equipment/network, data/documents, work/coordination or other category. || アプリ、機器・ネットワーク、データ・書類、業務・調整、その他から分類を選びます。',
    'Enter title, description and impact: work can continue, partially blocked or unable to continue. || 題名、詳細、影響（継続可能・一部支障・継続不能）を入力します。',
    'Add reproduction steps, expected behavior, location/equipment and necessary PNG/JPG/PDF evidence: up to 5 files per ticket, each at most 10 MB. || 再現手順、期待動作、場所・機器、必要なPNG・JPG・PDF証拠を添付します。1件最大5ファイル、各10 MB以下です。',
    'Submit, note the ticket number and open details. If the ticket saved but attachments failed, Retry remaining uploads in the same ticket. || 送信後に番号と詳細を確認します。受付保存後に添付が失敗した場合は、同じTicketでRetry remaining uploadsを使います。'
  ], 'The ticket number exists and successfully attached files can be inspected. || Ticket番号が発行され、成功した添付を確認できます。',
    'Attach evidence needed to resolve the problem. Check screenshots for passwords or access codes before submitting. || 解決に必要な証拠を添付し、送信前に画像へパスワード・アクセスコードが写っていないか確認します。') +
  P('35.2 Track replies and provide more information || 35.2 回答確認と追加情報提供', [
    'Open Support Center → My tickets, search number/title and filter status/category. || Support Center → My ticketsで番号・題名を検索し、状態・分類で絞ります。',
    'Read Conversation &amp; history and reply or add files within the same ticket. || Conversation &amp; historyを読み、同じTicketに返信・添付します。',
    'For Waiting for reporter, provide the requested information so the owner can continue. || Waiting for reporterなら要求情報を回答し、担当者が続行できるようにします。',
    'After Resolved, test the actual behavior and reply. If unresolved, include current steps and results. || Resolved後に実動作を確認して返信します。未解決なら最新の手順と結果を伝えます。',
    'Use permitted close/cancel actions when appropriate and supply required reasons. || 適切な場合に許可された完了・取消操作を使い、必要理由を記入します。'
  ], 'The same ticket retains the history and latest information. || 同じTicketに履歴と最新情報がまとまります。') +
  P('35.3 Take tickets and manage the queue || 35.3 受付担当と処理待ち管理', [
    'Open Support queue and filter Assigned to me or Unassigned in your categories. || Support queueで担当分類のAssigned to me・Unassignedを絞ります。',
    'Use Take this ticket for unassigned work. Admin uses Assign / categorize to change owner/category. || 未担当はTake this ticketで受け持ちます。AdminはAssign・categorizeで担当・分類を変更します。',
    'Update priority and actual status, for example Acknowledged → In progress → Waiting for reporter → Resolved → Closed, with reasons/solution. || 優先度と実状態を受付済み→対応中→報告者回答待ち→解決→完了などに更新し、理由・解決方法を記録します。',
    'Use Reply for reporter-visible messages; Internal note / Internal attachment is for support staff only. || 報告者向けはReply、担当者内の情報はInternal note・Internal attachmentを使います。',
    'Admin maintains category owners and separately grants recognition-award permission according to responsibility. || Adminは分類担当を管理し、担当に応じて感謝ポイント付与権限を別途設定します。'
  ], 'Tickets have owners and complete reply/status history. || Ticketに担当者と回答・状態履歴が揃います。',
    'Internal notes/files stay hidden from the reporter even if that reporter is also support staff. Notifications use the in-app bell; this module does not send email or Teams messages. || 内部メモ・ファイルは報告者がSupport担当でもその報告者には表示されません。通知はアプリのベルで、メール・Teams送信は行いません。') +
  P('35.4 Recognition for helpful reports || 35.4 有益な報告への感謝ポイント', [
    'Employees open Contribution history to see thank-you messages, criteria and accumulated points. || 従業員はContribution historyで感謝メッセージ、基準、累計を確認します。',
    'Authorized awarders review the ticket and choose a thank-you with 0 points or Useful +5. || 付与権限者が内容を確認し、0点の感謝またはUseful＋5を選びます。',
    'After Useful, Detailed +3 and Actionable +2 may be selected, up to 10 per ticket. || Useful選択後にDetailed＋3、Actionable＋2を追加でき、1件最大10点です。',
    'Enter the message and confirm. No self-awards or duplicates. Admin corrections need reasons, retain history and adjust only the difference. || メッセージを入力して確定します。自己付与・重複付与は禁止です。Admin修正は理由と履歴を残し、差分だけ調整します。'
  ], 'The reporter sees points and appreciation in their history. || 報告者の履歴に点数と感謝が表示されます。',
    'Recognition is separate from KPI, with no public leaderboard or reward redemption. Points exist only after an authorized decision. || KPIとは別で、公開ランキング・景品交換はありません。権限者が判断して初めて点数が発生します。'))

C('master', 'Master Data and engineering rates || マスターデータと技術原価単価', 'Master Data || Master Data', 'Master-data maintainers / authorized readers || マスター管理者・閲覧権限者',
  P('36.1 Maintain reference data || 36.1 共通マスターを管理', [
    'Select Customers, Suppliers, Employees, Inventory items, Engineering rates or User accounts in Master Data. || Master DataのCustomers、Suppliers、Employees、Inventory items、Engineering rates、User accountsから選びます。',
    'Search before adding; check duplicate codes, names and Active state. || 追加前に検索し、コード重複、名称、Active状態を確認します。',
    'Authorized editors enter category fields: supplier contacts; item code/unit/reorder point; or employee ID, department, position and supported account links. || 編集権限者が分類ごとの項目を入力します。仕入先連絡先、品目コード・単位・再発注点、社員番号・部署・役職・対応するアカウント関連などです。',
    'Save and search the record. If save succeeded but refresh failed, check for an existing record before adding again. || 保存後に検索します。保存成功・再読込失敗の場合は、再追加前に登録済みか確認します。',
    'User accounts is a reference for company-provided accounts/roles; contact the account administrator when no edit action exists. || User accountsは会社設定のアカウント・役割の参照用です。編集操作がない場合はアカウント管理者へ依頼します。'
  ], 'Codes, names, units and relationships are correct for use in other modules. || 他のモジュールで使うコード、名称、単位、関連が正しく登録されています。') +
  P('36.2 Maintain engineering cost rates || 36.2 技術労務単価を管理', [
    'Open Engineering rates and inspect existing rates and effective dates. || Engineering ratesで既存単価と適用日を確認します。',
    'Authorized users add level, department or employee scope and hourly/daily Engineering and Installation rates as the form offers. || 権限者はレベル、部署または社員の範囲と、Engineering・Installationの時間・日単価を入力します。',
    'Check values and effective dates before saving, then search to verify. || 金額と適用日を確認して保存し、検索して確認します。',
    'Have estimators recheck related Man-hour and Validation. || 見積担当が関連Man-hourとValidationを再確認します。'
  ], 'Verified rates and their effective dates are available in the master. || 確認済み単価と適用日がマスターに表示されます。',
    'Master changes do not imply rewriting historical costs or approved revisions, especially historical rates imported from Excel. || マスター変更で過去原価・承認版が上書きされるとは限りません。特にExcel取込の過去単価に注意します。'))

C('visit-master', 'Visit Master Data: configure site work || Visit Master Data：現地業務の共通設定', 'Visit Master Data || Visit Master Data', 'Site Visit administrators || Site Visit管理者',
  T(['Tab || タブ', 'Action || 操作', 'Check after saving || 保存後の確認'], [
    ['Visit Types || 訪問種類', 'Add/edit code, TH/EN/JP names, standard duration, engineer count and related checklist. || コード、3言語名、標準時間、技術者数、関連チェックリストを追加・編集。', 'Names follow language and used codes are preserved. || 言語表示と使用済みコードの維持。'],
    ['Skills || スキル', 'Maintain code, multilingual names, discipline, order and Active. || コード、3言語名、分野、順序、Activeを管理。', 'Skills are selectable in requests and profiles. || 申請・プロフィールで選択可能。'],
    ['Checklist Templates || チェックリスト', 'Choose a template; maintain sections/questions, answer type, Required and Guidance, then save. || Templateを選び、分類・質問、回答種類、Required、Guidanceを設定して保存。', 'Required questions and guidance match the work type. || 必須質問・案内が業務種類と一致。'],
    ['SLA || SLA', 'Edit offered response/execution periods; check Default and Active before Save. || 回答・対応期間を編集し、Default・Activeを確認して保存。', 'Default policy and times match team rules. || 既定ルールと時間がチーム規定と一致。'],
    ['Engineer Skills || 技術者スキル', 'Select engineer, skill and proficiency; add/remove based on actual capability. || 技術者、スキル、習熟度を選び、実能力に基づき追加・削除。', 'Suggested engineers have suitable skills. || 推奨技術者のスキルが適切。'],
    ['Availability || 対応可能日時', 'Choose engineer, kind, start/end and reason; add/remove availability entries within permissions. || 技術者、種類、開始・終了、理由を設定し、権限内で日時情報を追加・削除。', 'Periods are correct and not duplicated. || 期間が正しく重複がない。']
  ]) + N('After master changes, reopen a relevant request/visit form to check behavior. Do not assume new templates rewrite old visit checklists or evidence. || 設定後は関連申請・訪問フォームで結果を確認します。新Templateで過去のチェックリスト・証拠が書き換わるとは考えないでください。'))

C('audit-settings', 'Audit Log and Settings || Audit LogとSettings', 'Audit Log / Settings || Audit Log / Settings', 'Authorized auditors / Admin || 監査閲覧権限者・Admin',
  P('38.1 Inspect audit events || 38.1 操作履歴を確認', [
    'Open Audit Log and use offered filters/search for document, user, module or action. || Audit Logで書類、ユーザー、モジュール、操作の検索・フィルターを使います。',
    'Read date, actor, action and available before/after data or reasons. || 日付、実施者、操作、変更前後情報、理由を確認します。',
    'Compare with the current source document and note reference/time for any correction request. || 元書類の現在状態と比較し、修正依頼に必要な参照・時間を控えます。'
  ], 'You can explain who did what to which record and when. || 誰がいつどのレコードに何をしたか説明できます。',
    'Audit history is read-only evidence, not an undo or delete screen. || 履歴は閲覧専用の証拠であり、削除・取消操作の画面ではありません。') +
  P('38.2 Use Settings when reporting an access problem || 38.2 Settingsでアクセス問題を確認', [
    'Open Settings and check Signed-in identity and Team Test/Production mode. || SettingsでSigned-in identityとTeam Test・Productionを確認します。',
    'Review Live connections, Business timezone and Permissions to describe the access issue. || Live connections、Business timezone、Permissionsを確認して問題を説明します。',
    'For account or system changes, send the relevant module and symptoms to the administrator through Support. || アカウント・システム変更が必要ならSupportで対象モジュールと症状を管理者へ伝えます。'
  ], 'Support receives the relevant account/environment context accurately. || 正しいアカウント・環境情報を担当者へ伝えられます。',
    'This Settings screen is read-only. It has no Save action for browser-side changes to connections, authentication or document numbering. || このSettingsは閲覧専用です。接続、認証、採番をブラウザーから変更するSave操作はありません。'))

C('troubleshooting', 'Troubleshooting when work is blocked || 作業できない場合の確認と対処', 'All modules || 全モジュール', 'All employees || 全従業員',
  T(['Symptom || 症状', 'Check and next action || 確認と次の操作'], [
    ['Cannot open the app || アプリを開けない', 'Check company URL/network, Team Test or Production and your account. LAN URLs require network access. Contact the administrator if unresolved. || 会社URL・ネットワーク、Team Test・Production、本人アカウントを確認します。LANには接続可能な経路が必要です。未解決なら管理者へ連絡。'],
    ['Menu or button missing || メニュー・ボタンがない', 'Expand menu groups; check My Profile permissions and project role. State or approval order may hide actions. || メニューを展開し、Profile権限とProject役割を確認。状態・承認順序でも操作が非表示になります。'],
    ['Document not found || 書類が見つからない', 'Clear filters, verify number/customer and pagination, then check project scope before creating anything new. || フィルター、番号・顧客、ページを確認し、新規作成前にProject範囲を確認。'],
    ['Save timed out || 保存がタイムアウト', 'Reopen or refresh to see whether the save already succeeded before retrying, to avoid duplicates. || 再試行前に開き直して保存済みか確認し、重複を防止。'],
    ['Conflict / another user changed data || 競合・他人の更新', 'Keep needed unsaved text, reload and reconcile. Repeat Preview or select the current revision for imports/mappings. || 未保存文を控え、再読込して照合。取込・紐付けはPreviewや現行版選択をやり直す。'],
    ['Cannot Submit / Approve || 提出・承認できない', 'Read Validation/Readiness and verify mandatory fields, owner, state, approval step and permission. || Validation・Readiness、必須項目、担当、状態、承認工程、権限を確認。'],
    ['Rate missing or price invalid || 単価なし・価格不正', 'Check department/level/cost type/effective date and supplier/price/price date in Estimate; contact the master maintainer. || 部署・レベル・原価種類・適用日、見積の仕入先・価格・価格日を確認し、マスター担当へ連絡。'],
    ['Task visible but not editable || Taskは見えるが更新不可', 'Check that you are the assignee, membership is Active and the current plan is accepted. Closed work is read-only. || 本人担当、Active所属、現計画受諾を確認。完了業務は閲覧専用。'],
    ['Workload is a dash/incomplete || 負荷が「—」・情報不足', 'Set weekly capacity and missing dates/effort. Missing data does not mean no workload. || 週capacity、日付、工数の不足を入力。不明は負荷なしではありません。'],
    ['Receipt did not increase usable stock || 入庫しても使用可能在庫が増えない', 'Check GRN Confirm and accepted versus quarantine quantities; compare the same item in Stock Balances. Ask the controller for ledger details. || GRN確定、合格・隔離数量、同じ品目のStock Balancesを確認。台帳詳細は管理者へ依頼。'],
    ['Cannot reserve or issue || 引当・払出できない', 'Check Released BOM, Available stock, other project reservations and prior/net issues, not only on-hand stock. || Released BOM、Available、他Project引当、既払出・純払出を確認し、手元数量だけで判断しない。'],
    ['Cannot sign / approver absent || 署名不可・承認者が出ない', 'Check Active specimen, your step, named approver and valid permission. Drawings need distinct member, lead engineer and manager on the correct project. || Active見本、自分の工程、指定承認者、権限を確認。図面は正しいProjectのMember・Lead・Managerが別人で必要。'],
    ['Cannot position a signature || 署名配置ができない', 'Use readable supported PDF/PNG/JPEG. Ask for an appropriate source if encrypted or externally digitally signed. || 対応する読取可能PDF・PNG・JPEGを使用。暗号化・外部電子署名付きは適切な原本を依頼。'],
    ['Customer cannot open the report link || 顧客がリンクを開けない', 'Check Approved status, expiry, prior use, replacement links and network reachability of the URL. || Approved、有効期限、使用済み、新リンクによる置換、ネットワーク到達性を確認。'],
    ['OCR stalled or names wrong || 名刺OCR停止・誤読', 'Read progress, cancel/retry a clearer image when allowed, or enter manually. Check every multilingual field before Save. || 進行表示を確認し、可能なら中止・鮮明画像で再試行、または手入力。保存前に多言語項目を全確認。'],
    ['Export/download not found || 出力・ダウンロードがない', 'Check Downloads and browser download/pop-up permissions. Retry and verify the document number in the file. || Downloadsとダウンロード・ポップアップ許可を確認。再試行後にファイルの書類番号を確認。'],
    ['Support ticket saved without all files || Support保存後に添付不足', 'Open the created ticket and Retry remaining uploads; do not create another ticket. || 発行済みTicketでRetry remaining uploadsを使い、重複Ticketを作らない。'],
    ['KPI work or ratings absent || KPI業務・評価がない', 'Check review cycle, account-to-employee mapping and actual period records. Ask Admin to correct mapping. Unrated is not zero. || 評価期間、アカウントと社員の紐付け、期間内実績を確認。誤紐付けは管理者へ。未評価は0ではありません。']
  ]) + H('<p><b>Include in a Support report:</b> module and document number; time; preceding steps; exact error; expected result; impact; relevant screenshots.</p> || <p><b>Supportへ伝える情報：</b>モジュール・書類番号、発生時刻、直前の手順、エラー文、期待結果、影響、関連画面の画像。</p>'))

C('reference', 'Glossary, states and handover checklist || 用語・状態・引継ぎチェック', 'Reference || 参考', 'All employees || 全従業員',
  T(['Term || 用語', 'Meaning || 意味'], [
    ['Inquiry / INQ || Inquiry / INQ', 'Customer inquiry or opportunity || 顧客案件・商談'],
    ['Estimate / EST || Estimate / EST', 'Internal cost estimate || 社内原価見積'],
    ['Revision || Revision', 'A changed version with separate history || 独立した履歴を持つ改訂版'],
    ['Project / PJ || Project / PJ', 'Project executed from an approved source || 承認元に基づく実行プロジェクト'],
    ['Owner / PIC || Owner / PIC', 'Person primarily responsible for a record or task || レコード・業務の主担当'],
    ['WBS || WBS', 'Hierarchical work breakdown || 階層的な作業分解'],
    ['Man-day / MD || Man-day / MD', 'One person working one day; an effort unit || 1人が1日作業する工数単位'],
    ['Man-hour || Man-hour', 'Person-hours used in work estimates || 見積に使う人時間'],
    ['Capacity || Capacity', 'Work availability set for planning || 計画用に設定する対応可能量'],
    ['Baseline || Baseline', 'Saved reference plan for comparisons || 比較用に保存した基準計画'],
    ['BOM || BOM', 'Project bill of materials || プロジェクト資材表'],
    ['PR || PR', 'Purchase requisition || 購買申請書'],
    ['PO || PO', 'Purchase order; a customer PO stored in a project has a separate context || 発注書。Project内の顧客POとは文脈が異なる'],
    ['GRN || GRN', 'Goods receipt note || 入庫記録'],
    ['MIR || MIR', 'Material issue request || 資材払出申請'],
    ['Ledger || Ledger', 'Movement history used to calculate stock || 在庫計算の基となる移動台帳'],
    ['Quarantine || Quarantine', 'Held goods not yet available for use || 使用可能になる前の隔離品'],
    ['Snapshot || Snapshot', 'Data frozen at a particular action || 特定操作時点で固定した情報'],
    ['SLA || SLA', 'Target response or execution time || 回答・対応の目標時間'],
    ['UAT / POC || UAT / POC', 'User acceptance testing / proof of concept || 受入試験・概念実証']
  ]) + T(['Common state || よく使う状態', 'Meaning in operation || 業務上の意味'], [
    ['Draft || Draft', 'Unsubmitted or unconfirmed draft || 未提出・未確定の下書き'],
    ['Submitted / Pending review || Submitted / Pending review', 'Sent to the next responsible step || 次の担当工程へ提出済み'],
    ['Revision Required / Returned || Revision Required / Returned', 'Read reasons, correct through the module workflow and resubmit || 理由を読み、モジュール手順で修正・再提出'],
    ['Approved || Approved', 'Approved for that document step; downstream processes may remain || 対象書類で承認済み。後工程の完了とは限らない'],
    ['Locked / Released || Locked / Released', 'Frozen for onward use; changes follow revision rules || 後工程参照用に固定。変更は改訂手順'],
    ['Done || Done', 'Work finished, possibly awaiting verification || 作業済み。検収待ちの場合あり'],
    ['Completed / Closed || Completed / Closed', 'Finished under that module’s criteria; check evidence before handover || モジュール条件を満たして完了。引継ぎ前に証拠を確認'],
    ['Cancelled / Superseded / Retired || Cancelled / Superseded / Retired', 'Cancelled / replaced by a newer revision / retired from a library; old history may remain necessary || 取消・新版に置換・廃止。旧履歴の保管は引き続き必要な場合あり']
  ]) + H('<h3>Before every handover or completion</h3><ul class="checklist"><li>Correct document, customer, project and revision.</li><li>Required data and evidence complete; save succeeded.</li><li>Quantities, units, dates and totals match actual facts.</li><li>Correct owner/approver and a clear next step.</li><li>Exported files open and recipients can access them.</li><li>Open actions have an owner and due date; do not close work to hide unfinished items.</li></ul> || <h3>引継ぎ・完了前の確認</h3><ul class="checklist"><li>書類番号、顧客、Project、版が正しい。</li><li>必須情報・証拠が揃い、保存に成功している。</li><li>数量、単位、日付、合計が実際と一致する。</li><li>責任者・承認者が正しく、次工程が明確。</li><li>出力ファイルが開き、受取人がアクセスできる。</li><li>残アクションに担当者と期限があり、未完を隠すために完了にしていない。</li></ul>') +
  N('Scope: current menus and user/subtab routes reviewed against source and documentation dated 6 September 2026. Actual screenshots illustrate the accessible Team Test screens; they do not certify every backend integration or approval workflow. Availability still depends on deployment and permissions. || 対象範囲は2026年9月6日のソース・資料で確認した現行メニューとユーザー・下位タブです。実画面はアクセス可能なTeam Testの例であり、全連携・承認手順の動作保証ではありません。利用可否は導入環境と権限によります。'))
