[CmdletBinding()]
param(
    [string] $ApiOrigin = 'http://127.0.0.1:5106',
    [string] $RuntimeRoot = (Join-Path $env:LOCALAPPDATA 'IoTTeamCenter\TeamTest'),
    [string] $AuthorEmail = 'nattapol.p@tomastc.com',
    [string] $ApproverEmail = 'warit.c@tomastc.com'
)

$ErrorActionPreference = 'Stop'
$secretsPath = Join-Path $RuntimeRoot 'secrets.json'
$fixturePath = Join-Path (Split-Path -Parent $PSScriptRoot) 'tests\fixtures\site-visit-uat-note.txt'

function Unprotect-String([string] $CipherText) {
    $secureValue = ConvertTo-SecureString $CipherText
    $valuePointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureValue)
    try { return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($valuePointer) }
    finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($valuePointer) }
}

function New-TeamTestHeaders([string] $SigningKey, [string] $Email) {
    $normalizedEmail = $Email.Trim().ToLowerInvariant()
    $hmac = [Security.Cryptography.HMACSHA256]::new([Text.Encoding]::UTF8.GetBytes($SigningKey))
    try {
        $hash = $hmac.ComputeHash([Text.Encoding]::UTF8.GetBytes($normalizedEmail))
        $code = [Convert]::ToBase64String($hash).TrimEnd('=').Replace('+', '-').Replace('/', '_')
        return @{ 'X-Team-Test-Email' = $normalizedEmail; 'X-Team-Test-Code' = $code }
    }
    finally { $hmac.Dispose() }
}

function Invoke-Json([string] $Method, [string] $Path, [hashtable] $Headers, $Body = $null) {
    $parameters = @{
        Uri = "$ApiOrigin$Path"
        Method = $Method
        Headers = $Headers
        TimeoutSec = 60
    }
    if ($null -ne $Body) {
        $parameters.ContentType = 'application/json'
        $parameters.Body = $Body | ConvertTo-Json -Depth 20 -Compress
    }
    return Invoke-RestMethod @parameters
}

function Format-IsoDate([DateTime] $Value) {
    return $Value.ToString('yyyy-MM-dd', [Globalization.CultureInfo]::InvariantCulture)
}

if (!(Test-Path -LiteralPath $secretsPath)) { throw 'Team Test secrets are not installed.' }
if (!(Test-Path -LiteralPath $fixturePath)) { throw "UAT fixture is missing: $fixturePath" }

$secrets = Get-Content -Raw -LiteralPath $secretsPath | ConvertFrom-Json
$signingKey = Unprotect-String $secrets.TeamTestSigningKey
try {
    $authorHeaders = New-TeamTestHeaders $signingKey $AuthorEmail
    $approverHeaders = New-TeamTestHeaders $signingKey $ApproverEmail
    $authorBootstrap = Invoke-Json GET '/api/v1/bootstrap' $authorHeaders
    $approverBootstrap = Invoke-Json GET '/api/v1/bootstrap' $approverHeaders
    if ($authorBootstrap.user.role -ne 'Admin') { throw 'The UAT author must currently be an Admin.' }
    if ($approverBootstrap.permissions -notcontains 'visit.report_approve') { throw 'The UAT approver needs visit.report_approve.' }
    if ($authorBootstrap.user.id -eq $approverBootstrap.user.id) { throw 'Author and approver must be different users.' }

    $master = Invoke-Json GET '/api/v1/visit-master/' $authorHeaders
    $visitType = $master.visitTypes | Where-Object { $_.isActive -and $_.checklistTemplateId } | Select-Object -First 1
    $template = $master.checklistTemplates | Where-Object { $_.id -eq $visitType.checklistTemplateId } | Select-Object -First 1
    $skill = $master.skills | Where-Object { $_.isActive } | Select-Object -First 1
    $customer = $authorBootstrap.customers | Where-Object { $_.id -gt 0 } | Select-Object -First 1
    if (!$visitType -or !$template -or !$skill -or !$customer) { throw 'Required customer or Site Visit master data is missing.' }

    $timeZone = [TimeZoneInfo]::FindSystemTimeZoneById('SE Asia Standard Time')
    $scheduleDate = [DateTime]::Today.AddDays(60).AddHours(9)
    $scheduleStart = [DateTimeOffset]::new($scheduleDate, $timeZone.GetUtcOffset($scheduleDate))
    $scheduleEnd = $scheduleStart.AddHours(4)
    $today = Format-IsoDate ([DateTime]::Today)
    $dueDate = Format-IsoDate ([DateTime]::Today.AddDays(30))
    $runKey = [DateTimeOffset]::Now.ToString('yyyyMMdd-HHmmss')

    $intakePayload = @{
        customerId = [int64]$customer.id
        subject = "NODE UAT Site Visit $runKey"
        customerReferenceNo = "NODE-UAT-$runKey"
        requestDate = $today
        salesOwnerId = [int64]$authorBootstrap.user.id
        priority = 'Normal'
        requiredResponseDate = Format-IsoDate ([DateTime]::Today.AddDays(7))
        customerExpectedCompletion = Format-IsoDate ([DateTime]::Today.AddDays(90))
        source = 'Meeting'
        relatedInquiryId = $null
        relatedProjectId = $null
        contact = @{
            siteId = $null
            siteContactId = $null
            customerBranch = 'Node UAT branch'
            siteName = 'Node UAT factory'
            siteAddress = '123 Industrial Road, Chonburi, Thailand'
            contactName = 'Node UAT Customer'
            contactDepartment = 'Engineering'
            contactPosition = 'Manager'
            contactPhone = '+66-80-000-0000'
            contactEmail = 'node-uat@example.invalid'
            contactChannel = 'Email'
        }
        requirement = @{
            problemStatement = 'The current production process has repeated manual errors and needs an engineering site survey.'
            desiredCapability = 'Collect actual site conditions and define a reliable automation scope.'
            expectedResult = 'The team must leave the site with enough verified information to prepare a complete estimate.'
            expectedScope = 'Survey the machine, electrical supply, network, safety constraints, and installation area.'
            outOfScope = 'No production modification will be performed during this UAT visit.'
            existingProcess = 'Operators currently record production information manually at the machine.'
            currentPainPoint = 'Manual records are incomplete and engineering assumptions cannot be confirmed remotely.'
            targetCycleTime = '60 seconds'
            productInformation = 'Non-confidential UAT product'
            qualityRequirement = 'Record all observations with traceable notes.'
            specialRequirement = 'Use only non-confidential test information.'
            budgetRange = 'UAT only'
            expectedTimeline = 'Within this UAT cycle'
            competitorInformation = ''
            additionalNotes = 'Created automatically by the Node.js end-to-end UAT.'
        }
        machine = @{
            machineName = 'Node UAT Test Station'
            machineModel = 'UAT-001'
            machineSerialNo = 'NODE-UAT'
            manufacturer = 'TOMAS TECH'
            existingSystem = 'A standalone UAT workstation used only to validate the application workflow.'
            controllerBrand = 'Mitsubishi'
            availableDrawing = 'Test drawing available'
            utilityInformation = '200 VAC and test network'
            installationArea = 'UAT zone'
            spaceLimitation = 'No limitation for UAT'
            workingEnvironment = 'Indoor controlled environment'
            safetyRequirement = 'Safety shoes and normal factory PPE required.'
            productionSchedule = 'UAT schedule only'
            shutdownWindow = 'Available for UAT'
            ppeRequirement = 'Safety shoes'
            siteAccessRequirement = 'Register with the UAT coordinator before entry.'
            photographyRestricted = $false
            ndaRequired = $false
        }
        visitTypeIds = @([int64]$visitType.id)
        skillIds = @([int64]$skill.id)
        windows = @(@{
            startsAt = $scheduleStart.ToString('o')
            endsAt = $scheduleEnd.ToString('o')
            preference = 1
            note = 'Primary UAT window'
        })
    }

    $intake = Invoke-Json POST '/api/v1/sales-intakes/' $authorHeaders $intakePayload
    $intakeDetail = Invoke-Json GET "/api/v1/sales-intakes/$($intake.id)" $authorHeaders
    $submitted = Invoke-Json POST "/api/v1/sales-intakes/$($intake.id)/status" $authorHeaders @{
        status = 'Pending Technical Review'; reason = 'Node.js end-to-end UAT'; rowVersion = $intakeDetail.rowVersion
    }
    $reviewed = Invoke-Json POST "/api/v1/sales-intakes/$($intake.id)/review" $approverHeaders @{
        decision = 'Ready to Schedule'
        comment = 'Technical information is sufficient for the Node.js UAT.'
        visitScope = 'Validate the complete Site Visit workflow.'
        engineerCount = 1
        estimatedDurationMinutes = 240
        requiredEquipment = 'Laptop and standard PPE'
        riskAssessment = 'Low risk controlled UAT'
        safetyConcern = 'Follow normal site safety rules'
        requiresManagerApproval = $false
        skillIds = @([int64]$skill.id)
        rowVersion = $submitted.rowVersion
    }

    $visit = Invoke-Json POST '/api/v1/site-visits/' $authorHeaders @{
        intakeId = [int64]$intake.id
        visitTypeId = [int64]$visitType.id
        checklistTemplateId = [int64]$template.id
        proposedWindowId = $null
        scheduledStart = $scheduleStart.ToString('o')
        scheduledEnd = $scheduleEnd.ToString('o')
        timeZoneId = 'SE Asia Standard Time'
        travelMinutesBefore = 30
        travelMinutesAfter = 30
        meetingPoint = 'Node UAT reception'
        requiredEquipment = 'Laptop and standard PPE'
        internalNote = 'Automated end-to-end UAT'
        customerNote = 'Non-confidential UAT record'
        requiredEngineerCount = 1
    }
    $visitDetail = Invoke-Json GET "/api/v1/site-visits/$($visit.id)" $authorHeaders
    $assignment = Invoke-Json POST "/api/v1/site-visits/$($visit.id)/assignments" $authorHeaders @{
        engineerId = [int64]$authorBootstrap.user.id
        assignmentRole = 'Lead Engineer'
        conflictOverride = $true
        overrideReason = 'Authorized Node.js UAT scheduling window'
        rowVersion = $visitDetail.rowVersion
    }
    $visitDetail = Invoke-Json GET "/api/v1/site-visits/$($visit.id)" $authorHeaders
    $assignmentDetail = $visitDetail.assignments | Where-Object { $_.id -eq $assignment.assignmentId } | Select-Object -First 1
    $null = Invoke-Json POST "/api/v1/site-visits/$($visit.id)/assignments/$($assignment.assignmentId)/response" $authorHeaders @{
        response = 'Accepted'; note = 'Accepted for Node.js UAT'; proposedStart = $null; proposedEnd = $null; rowVersion = $assignmentDetail.rowVersion
    }
    $visitDetail = Invoke-Json GET "/api/v1/site-visits/$($visit.id)" $authorHeaders
    $pendingEngineer = Invoke-Json POST "/api/v1/site-visits/$($visit.id)/status" $authorHeaders @{
        status = 'Pending Engineer Confirmation'; reason = ''; rowVersion = $visitDetail.rowVersion
    }
    $pendingCustomer = Invoke-Json POST "/api/v1/site-visits/$($visit.id)/status" $authorHeaders @{
        status = 'Pending Customer Confirmation'; reason = ''; rowVersion = $pendingEngineer.rowVersion
    }
    $confirmation = Invoke-Json POST "/api/v1/site-visits/$($visit.id)/confirmations" $authorHeaders @{
        party = 'Customer'; outcome = 'Confirmed'; channel = 'Email'; confirmedByName = 'Node UAT Customer'
        confirmedAt = [DateTimeOffset]::Now.ToString('o'); comment = 'Confirmed for Node.js UAT'
        evidenceAttachmentId = $null; rowVersion = $pendingCustomer.rowVersion
    }
    $confirmed = Invoke-Json POST "/api/v1/site-visits/$($visit.id)/status" $authorHeaders @{
        status = 'Confirmed'; reason = ''; rowVersion = $confirmation.rowVersion
    }
    $checkedIn = Invoke-Json POST "/api/v1/site-visits/$($visit.id)/check-in" $authorHeaders @{
        actualAttendees = $authorBootstrap.user.name
        customerAttendees = 'Node UAT Customer'
        locationConsentGiven = $false
        latitude = $null
        longitude = $null
        rowVersion = $confirmed.rowVersion
    }
    $visitDetail = Invoke-Json GET "/api/v1/site-visits/$($visit.id)" $authorHeaders
    $answers = @($visitDetail.checklist | ForEach-Object {
        @{ checklistItemId = [int64]$_.itemId; responseValue = 'Verified in Node.js UAT'; numericValue = $null; unit = $_.itemUnit; isNotApplicable = $false; note = 'Automated UAT answer' }
    })
    $checklistResult = Invoke-Json PUT "/api/v1/site-visits/$($visit.id)/checklist" $authorHeaders $answers
    $finding = Invoke-Json POST "/api/v1/site-visits/$($visit.id)/findings" $authorHeaders @{
        kind = 'Finding'; title = 'Node.js UAT finding'; detail = 'The native Node.js Site Visit workflow recorded this finding.'
        measurementValue = $null; measurementUnit = ''; severity = 'Info'; sortOrder = 10
    }
    $upload = Invoke-RestMethod -Uri "$ApiOrigin/api/v1/site-visits/$($visit.id)/attachments" -Method POST -Headers $authorHeaders -Form @{
        file = Get-Item -LiteralPath $fixturePath
        category = 'UAT Evidence'
        description = 'Non-confidential Node.js UAT attachment'
        findingId = [string]$finding.findingId
    } -TimeoutSec 60
    $downloadPath = Join-Path ([IO.Path]::GetTempPath()) "iot-team-site-visit-uat-$($upload.id).txt"
    try {
        Invoke-WebRequest -Uri "$ApiOrigin/api/v1/site-visits/$($visit.id)/attachments/$($upload.id)/content" -Headers $authorHeaders -OutFile $downloadPath -TimeoutSec 60
        if ((Get-FileHash -LiteralPath $downloadPath -Algorithm SHA256).Hash -ne (Get-FileHash -LiteralPath $fixturePath -Algorithm SHA256).Hash) {
            throw 'Downloaded attachment does not match the uploaded file.'
        }
    }
    finally { Remove-Item -LiteralPath $downloadPath -Force -ErrorAction SilentlyContinue }

    $visitDetail = Invoke-Json GET "/api/v1/site-visits/$($visit.id)" $authorHeaders
    $checkedOut = Invoke-Json POST "/api/v1/site-visits/$($visit.id)/check-out" $authorHeaders @{
        executionNote = 'Node.js UAT execution completed.'; rowVersion = $visitDetail.rowVersion
    }
    $visitDetail = Invoke-Json GET "/api/v1/site-visits/$($visit.id)" $authorHeaders
    $savedReport = Invoke-Json PUT "/api/v1/site-visits/$($visit.id)/report" $authorHeaders @{
        visitSummary = 'The Node.js UAT completed the full engineer site visit workflow successfully.'
        customerRequirement = 'Validate a complete traceable workflow with real SQL Server persistence.'
        existingCondition = 'The application was running locally with the native Node.js backend.'
        findingsSummary = 'A non-confidential UAT finding and attachment were recorded.'
        measurementSummary = 'No production measurement was taken during this application UAT.'
        rootCause = 'Not applicable to this controlled application UAT.'
        recommendedSolution = 'Use the native Node.js backend after final release verification.'
        proposedScope = 'Continue with Inquiry and Estimate creation from the approved report.'
        assumption = 'The Team Test SQL database remains the approved UAT data source.'
        exclusion = 'No customer production equipment was modified.'
        risk = 'Low; the test data is clearly labelled and non-confidential.'
        safetyConcern = 'Normal application and site safety controls apply.'
        customerAdditionalRequest = ''
        engineerConclusion = 'The native Node.js backend persisted, retrieved, and advanced every tested Site Visit record correctly.'
        salesFollowUp = 'Review the generated Inquiry and Estimate records.'
        nextStep = 'Release the verified Node.js API to the Local Network endpoint.'
        changeSummary = 'Initial Node.js end-to-end UAT report'
        rowVersion = $visitDetail.report.rowVersion
    }
    $submittedReport = Invoke-Json POST "/api/v1/site-visits/$($visit.id)/report/submit" $authorHeaders @{
        status = 'Submitted'; rowVersion = $savedReport.rowVersion
    }
    $approvedReport = Invoke-Json POST "/api/v1/site-visits/$($visit.id)/report/review" $approverHeaders @{
        decision = 'Approved'; comment = 'Approved after the native Node.js end-to-end UAT.'; rowVersion = $submittedReport.rowVersion
    }
    $acknowledgedReport = Invoke-Json POST "/api/v1/site-visits/$($visit.id)/report/acknowledge" $authorHeaders @{
        acknowledgedBy = 'Node UAT Customer'; acknowledgedAt = [DateTimeOffset]::Now.ToString('o'); signatureDataUrl = $null
        rowVersion = $approvedReport.rowVersion
    }
    $inquiry = Invoke-Json POST "/api/v1/site-visits/$($visit.id)/inquiry" $authorHeaders @{
        projectName = "Node.js UAT Project $runKey"; projectType = 'IoT'; estimateOwnerId = [int64]$authorBootstrap.user.id
        dueDate = $dueDate; priority = 'Normal'; projectProbability = 75; customerInterestGrade = 'B'
        remark = 'Created from the approved Node.js Site Visit UAT report.'
    }
    $estimate = Invoke-Json POST "/api/v1/site-visits/$($visit.id)/estimate" $authorHeaders @{}
    $visitDetail = Invoke-Json GET "/api/v1/site-visits/$($visit.id)" $authorHeaders
    $closed = Invoke-Json POST "/api/v1/site-visits/$($visit.id)/close" $authorHeaders @{
        reason = 'Node.js end-to-end UAT completed successfully.'; rowVersion = $visitDetail.rowVersion
    }

    [pscustomobject]@{
        api = $ApiOrigin
        author = $authorBootstrap.user.name
        approver = $approverBootstrap.user.name
        intake = $intake.number
        intakeStatus = $reviewed.status
        visit = $visit.number
        visitStatus = $closed.status
        checklistAnswers = $checklistResult.saved
        findingId = $finding.findingId
        attachmentId = $upload.id
        attachmentRoundTrip = $true
        report = $checkedOut.reportNumber
        reportStatus = $acknowledgedReport.status
        inquiry = $inquiry.number
        estimate = $estimate.number
        estimateCreated = $estimate.created
    } | ConvertTo-Json -Depth 5
}
finally {
    $signingKey = $null
    $authorHeaders = $null
    $approverHeaders = $null
}
