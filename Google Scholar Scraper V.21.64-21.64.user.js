// ==UserScript==
// @name         Google Scholar Scraper V.21.64
// @namespace    http://tampermonkey.net/
// @version      21.64
// @description  Thai Precision Fix: ป้องกันการลบตัวอักษร "อ" ในชื่อจริง (อาภาภรณ์) และปรับปรุงระบบคลีนให้แม่นยำขึ้น
// @author       OmaGa03-RDI-PCRU
// @match        https://scholar.google.com/citations?*
// @grant        GM_xmlhttpRequest
// @grant        GM_info
// @homepageURL  https://github.com/omaga03/tampermonkey_Google-Scholar-Scraper
// @supportURL   https://github.com/omaga03/tampermonkey_Google-Scholar-Scraper/issues
// @updateURL    https://raw.githubusercontent.com/omaga03/tampermonkey_Google-Scholar-Scraper/main/Google_Scholar_Scraper.js
// @downloadURL  https://raw.githubusercontent.com/omaga03/tampermonkey_Google-Scholar-Scraper/main/Google_Scholar_Scraper.js
// ==/UserScript==

(function() {
    'use strict';

    const DELAY_DEEP_MIN = 2000;
    const DELAY_DEEP_MAX = 5000;

    let isPaused = false;
    let isStopped = false;
    let currentMode = 'deep';
    let dataRange = "";
    let globalStats = { processedAuthors: 0, totalAuthors: 0, totalMatches: 0, totalMismatches: 0 };
    let originalTabTitle = document.title;

    const styleSheet = document.createElement("style");
    styleSheet.innerText = `
        @keyframes pulse-green { 0% { opacity: 1; transform: scale(1); } 50% { opacity: 0.3; transform: scale(1.3); } 100% { opacity: 1; transform: scale(1); } }
        .gs-btn-dynamic { transition: all 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275) !important; }
        .gs-btn-dynamic:hover { transform: translateY(-3px) scale(1.02); filter: brightness(1.1); box-shadow: 0 8px 25px rgba(0,0,0,0.2) !important; }
        @media print {
            @page { size: A4; margin: 10mm; }
            html, body { height: auto !important; overflow: visible !important; }
            body > *:not(#gs-modal-print) { display: none !important; }
            #gs-modal-print { position: relative !important; display: block !important; width: 100% !important; border: none !important; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
            .no-print { display: none !important; }
            #gs-modal-content { overflow: visible !important; height: auto !important; }
            a { text-decoration: underline !important; color: #1a73e8 !important; }
        }
    `;
    document.head.appendChild(styleSheet);

    window.addEventListener('load', () => { createUI(); });

    function getFormattedTimestamp() {
        const now = new Date();
        return `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}_${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}${String(now.getSeconds()).padStart(2, '0')}`;
    }

    function getLevenshteinDistance(a, b) {
        const matrix = [];
        for (let i = 0; i <= b.length; i++) matrix[i] = [i];
        for (let j = 0; j <= a.length; j++) matrix[0][j] = j;
        for (let i = 1; i <= b.length; i++) {
            for (let j = 1; j <= a.length; j++) {
                if (b.charAt(i - 1) === a.charAt(j - 1)) matrix[i][j] = matrix[i - 1][j - 1];
                else matrix[i][j] = Math.min(matrix[i - 1][j - 1] + 1, Math.min(matrix[i][j - 1] + 1, matrix[i - 1][j] + 1));
            }
        }
        return matrix[b.length][a.length];
    }

    function createUI() {
        const container = document.createElement('div');
        Object.assign(container.style, { position: 'fixed', bottom: '30px', right: '30px', zIndex: '9999', display: 'flex', flexDirection: 'column', gap: '12px', padding: '22px', backgroundColor: 'rgba(255, 255, 255, 0.92)', backdropFilter: 'blur(12px)', borderRadius: '20px', boxShadow: '0 10px 40px rgba(0, 0, 0, 0.15)', border: '1px solid rgba(255, 255, 255, 0.4)', fontFamily: "'Sarabun', sans-serif" });
        const scriptVersion = (typeof GM_info !== 'undefined') ? GM_info.script.version : '21.64';
        const title = document.createElement('div');
        title.innerText = `🤖 Scholar Tools v${scriptVersion}`;
        Object.assign(title.style, { fontSize: '11px', fontWeight: 'bold', color: '#888', textAlign: 'center', marginBottom: '8px', textTransform: 'uppercase' });
        container.appendChild(title);

        function createBtn(text, colors, onClick) {
            const btn = document.createElement('button');
            btn.className = 'gs-btn-dynamic';
            btn.innerHTML = text;
            Object.assign(btn.style, { padding: '15px 28px', background: `linear-gradient(135deg, ${colors[0]}, ${colors[1]})`, color: 'white', border: 'none', borderRadius: '50px', cursor: 'pointer', fontWeight: '600', fontSize: '15px', width: '100%', minWidth: '270px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '12px' });
            btn.onclick = onClick;
            return btn;
        }
        container.appendChild(createBtn('👤 1. รายชื่อ (Profile)', ['#11998e', '#38ef7d'], () => startGrandProcess('profile')));
        container.appendChild(createBtn('⚡ 2. บทความ (Articles)', ['#f12711', '#f5af19'], () => startGrandProcess('basic')));
        container.appendChild(createBtn('🛡️ 3. ตรวจสอบ (Deep Dive)', ['#CB356B', '#BD3F32'], () => startGrandProcess('deep')));
        document.body.appendChild(container);
    }

    function createDashboard(mode) {
        const old = document.getElementById('gs-dashboard');
        if (old) old.remove();
        const dash = document.createElement('div');
        dash.id = 'gs-dashboard';
        Object.assign(dash.style, { position: 'fixed', top: '15px', right: '15px', width: '340px', backgroundColor: 'rgba(20,20,20,0.96)', color: '#fff', padding: '20px', borderRadius: '15px', zIndex: '10000', fontSize: '13px', fontFamily: 'Sarabun, sans-serif', boxShadow: '0 15px 40px rgba(0,0,0,0.6)', border: '1px solid #333' });
        dash.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:15px;">
                <h3 style="margin:0; color:#f1c40f; font-size:15px;">🚀 ${mode.toUpperCase()} ${dataRange ? `(${dataRange})` : ''}</h3>
                <div style="display:flex; align-items:center; gap:8px;">
                    <span id="gs-pulse" style="width:10px; height:10px; background:#00ff00; border-radius:50%; display:inline-block; animation: pulse-green 1.5s infinite;"></span>
                    <span id="gs-status-text" style="font-size:12px; color:#00ff00; font-weight:bold;">Running...</span>
                </div>
            </div>
            <div id="gs-author-info" style="font-weight:bold; margin-bottom:8px; color:#fff; font-size:14px;">รอเริ่ม...</div>
            <div id="gs-article-info" style="color:#ccc; font-size:12px; margin-bottom:12px;">-</div>
            <div id="gs-cleaned-info" style="color:#00ff00; font-size:11px; padding-top:10px; border-top:1px dashed #444; word-break: break-all;">🔍 author: -</div>
            <div style="display:flex; gap:12px; margin-top:20px;">
                <button id="gs-p" style="flex:1; padding:12px; cursor:pointer; background:#f39c12; border:none; color:white; font-weight:bold; border-radius:8px; display:flex; align-items:center; justify-content:center; gap:6px;">⏸️ Pause</button>
                <button id="gs-s" style="flex:1; padding:12px; cursor:pointer; background:#e74c3c; border:none; color:white; font-weight:bold; border-radius:8px; display:flex; align-items:center; justify-content:center; gap:6px;">🛑 Stop</button>
            </div>
        `;
        document.body.appendChild(dash);
        document.getElementById('gs-p').onclick = function() {
            isPaused = !isPaused;
            this.innerHTML = isPaused ? "▶️ Resume" : "⏸️ Pause";
            this.style.background = isPaused ? "#27ae60" : "#f39c12";
            document.getElementById('gs-pulse').style.animation = isPaused ? "none" : "pulse-green 1.5s infinite";
            document.getElementById('gs-status-text').innerText = isPaused ? "Paused" : "Running...";
        };
        document.getElementById('gs-s').onclick = () => { if(confirm("หยุดการทำงานและสรุปผล?")) { isStopped = true; isPaused = false; } };
    }

    async function startGrandProcess(mode) {
        currentMode = mode;
        const rangeEl = document.querySelector('.gs_nph.gsc_pgn_ppn');
        dataRange = rangeEl ? rangeEl.innerText.trim().replace(/\s+/g, '') : "";
        createDashboard(mode); isPaused = false; isStopped = false;
        originalTabTitle = document.title;
        globalStats = { processedAuthors: 0, totalAuthors: 0, totalMatches: 0, totalMismatches: 0 };
        const ionBtn = document.getElementById('gsc_prf_ion_btn');
        const ionTxt = document.getElementById('gs_prf_ion_txt');
        if (ionBtn && (!ionTxt || ionTxt.innerText.trim() === "")) { ionBtn.click(); await new Promise(r => setTimeout(r, 750)); }
        let authorItems = document.querySelectorAll('.gs_ai_name a'); let isSingle = false;
        if (authorItems.length === 0) { const sn = document.querySelector('#gsc_prf_in'); if (sn) { authorItems = [sn]; isSingle = true; } }
        if (authorItems.length === 0) return alert("❌ ไม่พบรายชื่อ");
        globalStats.totalAuthors = authorItems.length;
        let masterData = [];
        for (let i = 0; i < authorItems.length; i++) {
            if (isStopped) break;
            globalStats.processedAuthors = i + 1;
            const item = authorItems[i];
            let profileUrl = isSingle ? window.location.href : (item.getAttribute('href') || window.location.href);
            if (!profileUrl.startsWith('http')) profileUrl = 'https://scholar.google.com' + profileUrl;
            const profileDoc = await fetchHTML(profileUrl, isSingle);
            if (!profileDoc) return;
            const rawMainName = (profileDoc.getElementById('gsc_prf_in') || item).innerText.trim();
            const altEl = profileDoc.getElementById('gs_prf_ion_txt');
            const altText = altEl ? altEl.innerText.trim() : "";
            const altArray = altText.split(',').map(n => n.trim()).filter(n => n !== "");

            const allCleanedNames = getCleanedNameList([rawMainName, ...altArray]);
            const mainDisplay = allCleanedNames[0] || "Unknown";

            if(document.getElementById('gs-cleaned-info')) document.getElementById('gs-cleaned-info').innerText = `🔍 author: ${allCleanedNames.join(' | ')}`;
            updateDashUI(mainDisplay, mode === 'profile' ? "กำลังเก็บโปรไฟล์..." : "กำลังเริ่ม...", i + 1, authorItems.length);

            let detailedArticles = [];
            if (mode !== 'profile') {
                const userId = getParameterByName('user', profileUrl);
                const articlesList = await fetchAllArticlesList(userId); if (!articlesList) return;
                for (let j = 0; j < articlesList.length; j++) {
                    if (isStopped) break;
                    const art = articlesList[j];
                    document.title = `(👤${i+1}/${authorItems.length} | 📄${j+1}/${articlesList.length}) ${mainDisplay.toUpperCase()} | Scholar`;
                    updateDashUI(mainDisplay, art.title, j + 1, articlesList.length);
                    let authorsInArt = "-"; let isMatch = false; let isFuzzy = false;
                    if (mode === 'deep') {
                        await smartSleep();
                        authorsInArt = await fetchArticleDeepDetail(art.url);
                        if (authorsInArt === "BLOCK") return;

                        const matchRes = checkAdvancedMatching(allCleanedNames, authorsInArt);
                        isMatch = matchRes.isMatch;
                        isFuzzy = matchRes.isFuzzy;
                        authorsInArt = matchRes.modifiedAuthors;

                        if (isMatch) globalStats.totalMatches++; else globalStats.totalMismatches++;
                    }
                    detailedArticles.push({ title: art.title, url: art.url, authorsInArticle: authorsInArt, isMatch: isMatch, isFuzzy: isFuzzy });
                }
            } else {
                 document.title = `(👤${i+1}/${authorItems.length}) ${mainDisplay.toUpperCase()} | Scholar`;
            }
            masterData.push({ authorName: rawMainName, altNames: altText, profileUrl: profileUrl, articles: detailedArticles });
            await smartSleep();
        }
        if(document.getElementById('gs-dashboard')) document.getElementById('gs-dashboard').remove();
        document.title = "✅ [DONE] Scholar Scraper";
        showGrandResultModal(masterData, mode);
    }

    function getCleanedNameList(rawNames) {
        let finalSet = new Set();
        rawNames.forEach(raw => {
            let normalized = raw.toLowerCase().replace(/http\S+/g, '').replace(/\(.*?\)/g, '').replace(/[.,()\-;:|/> <\[\]{}]/g, ' ').replace(/\d+/g, ' ');
            let engPart = normalized.replace(/[ก-๙]/g, '').replace(/\s+/g, ' ').trim();
            let thaiPart = normalized.replace(/[a-z]/g, '').replace(/\s+/g, ' ').trim();
            if (engPart) { let clean = normalizeName(engPart); if (clean.length > 2) finalSet.add(clean); }
            if (thaiPart) { let clean = normalizeName(thaiPart); if (clean.length > 2) finalSet.add(clean); }
            const bracketMatch = raw.match(/\(([^)]+)\)/);
            if (bracketMatch) {
                let inside = normalizeName(bracketMatch[1].toLowerCase());
                if (inside.length > 3) finalSet.add(inside);
            }
        });
        return Array.from(finalSet).filter(n => n !== "");
    }

    function checkAdvancedMatching(cleanedNames, articleAuthors) {
        if (!articleAuthors || articleAuthors === "ไม่ระบุ") return { isMatch: false, isFuzzy: false, modifiedAuthors: articleAuthors };
        const normArtAll = normalizeName(articleAuthors);
        for (let searchName of cleanedNames) {
            if (!searchName) continue;
            const s_noSpace = searchName.replace(/\s/g, '');
            const a_noSpace = normArtAll.replace(/\s/g, '');
            if (a_noSpace.includes(s_noSpace)) return { isMatch: true, isFuzzy: false, modifiedAuthors: articleAuthors };
            const parts = searchName.split(' ');
            if (parts.length >= 2) {
                const first = parts[0];
                const last = parts[parts.length - 1];
                const initials = parts.map(p => p.charAt(0)).join('');
                const initialsPattern = initials.split('').join('\\.?\\s*');
                const regInitials = new RegExp(`\\b${initialsPattern}\\b.*\\b${last}\\b`, 'i');
                const regFlex = new RegExp(`\\b(${first}|${first.charAt(0)}\\.?)\\b.*\\b${last}\\b`, 'i');
                const regRev = new RegExp(`\\b${last}\\b,?\\s*(${first}|${first.charAt(0)}\\.?)`, 'i');
                const regReverseFull = new RegExp(`\\b${last.charAt(0)}\\.?\\s*${first}\\b`, 'i');
                if (regInitials.test(normArtAll) || regFlex.test(normArtAll) || regRev.test(normArtAll) || regReverseFull.test(normArtAll)) return { isMatch: true, isFuzzy: false, modifiedAuthors: articleAuthors };
                const authorTokens = articleAuthors.split(/[,/]+/).map(t => t.trim());
                let tokenMatched = false; let foundFuzzy = false; let newAuthors = [];
                for (let author of authorTokens) {
                    const cleanAuthor = normalizeName(author);
                    const aParts = cleanAuthor.split(/\s+/);
                    if (aParts.length < 2) {
                        if (cleanAuthor.includes(last.toLowerCase()) && cleanAuthor.includes(first.charAt(0).toLowerCase())) {
                             tokenMatched = true; foundFuzzy = true;
                             newAuthors.push(`${author} <span style="color:#d35400; font-weight:bold; font-size:10px;">[Spelling Var.]</span>`);
                             continue;
                        }
                        newAuthors.push(author); continue;
                    }
                    const aFirst = aParts[0].toLowerCase(); const aLast = aParts[aParts.length - 1].toLowerCase();
                    const sFirst = first.toLowerCase(); const sLast = last.toLowerCase();
                    const isFirstMatch = (getLevenshteinDistance(sFirst, aFirst) <= 3) || (aFirst.length <= 2 && sFirst.startsWith(aFirst.charAt(0))) || (sFirst.length <= 2 && aFirst.startsWith(sFirst.charAt(0)));
                    const isLastMatch = (getLevenshteinDistance(sLast, aLast) <= 3) || aLast.includes(sLast) || sLast.includes(aLast);
                    if (isFirstMatch && isLastMatch) {
                        tokenMatched = true;
                        if (sFirst === aFirst && sLast === aLast) { newAuthors.push(author); }
                        else { newAuthors.push(`${author} <span style="color:#d35400; font-weight:bold; font-size:10px;">[Spelling Var.]</span>`); foundFuzzy = true; }
                    } else { newAuthors.push(author); }
                }
                if (tokenMatched) return { isMatch: true, isFuzzy: foundFuzzy, modifiedAuthors: newAuthors.join(', ') };
            }
        }
        return { isMatch: false, isFuzzy: false, modifiedAuthors: articleAuthors };
    }

    function normalizeName(n) {
        if (!n) return "";
        let x = n.toLowerCase().replace(/http\S+/g, '').replace(/\(.*?\)/g, '').replace(/[.,()\-;:|/> <\[\]{}]/g, ' ').replace(/\d+/g, ' ');

        const junkEng = /\b(assistant professor|associate professor|research assistant|mr|mrs|ms|jr|sr|miss|master|ph\s*d|p\s*h\s*d|d\s*eng|dr|prof|asst|assoc|dean|director|secretary|chairman|president|hon|rev|fr|sir|lady|eng|arch)\b/gi;

        // ภาษาไทย: ปรับปรุงการลบ "อ" และ "ศ" ให้ปลอดภัยขึ้น
        const junkThai = /(ผู้ช่วยศาสตราจารย์|รองศาสตราจารย์|ศาสตราจารย์|นักวิจัย|อธิการบดี|คณบดี|ผู้อำนวยการ|ผอ|ว่าที่\s*รต|พท|พต|พจ|นาย|นาง|นางสาว|ดร|ผศ|รศ|อาจารย์|นพ|พญ|สัตวแพทย์|สพ|ทพ|พตอ|พตท|รตอ|รตท|รตต|จสต|สอ|สต|พลเอก|พลโท|พลตรี|พันเอก|พันโท|พันตรี|พลท|พลต|พลม|พลร|พทท|เชี่ยวชาญ|ทรงคุณวุฒิ|ชำนาญการ|พิเศษ|รักษาการ|เลขาธิการ|ประธาน|วศบ|สถบ|นบ)/gi;

        let cleaned = x.replace(junkEng, '').replace(junkThai, '');

        // ลบอักษรตัวเดียว อ หรือ ศ เฉพาะกรณีที่เป็นคำโดดๆ (ตำแหน่ง) ไม่ลบอักษรที่เป็นส่วนหนึ่งของชื่อ
        cleaned = cleaned.replace(/\b[อศ]\b/g, '').replace(/\s+/g, ' ').trim();

        return cleaned;
    }

    function updateDashUI(a, t, i, total) { const ae = document.getElementById('gs-author-info'); const te = document.getElementById('gs-article-info'); if(ae) ae.innerText = `👤 [${globalStats.processedAuthors}/${globalStats.totalAuthors}] ${a}`; if(te) te.innerText = `📄 [${i}/${total}] ${t.substring(0,35)}...`; }
    async function smartSleep() { while (isPaused) await new Promise(r => setTimeout(r, 1000)); await new Promise(r => setTimeout(r, Math.floor(Math.random()*(DELAY_DEEP_MAX-DELAY_DEEP_MIN)+DELAY_DEEP_MIN))); }
    function fetchHTML(url, isCurrentDoc) { if (isCurrentDoc) return Promise.resolve(document); return new Promise((resolve) => { GM_xmlhttpRequest({ method: "GET", url: url, onload: (res) => { if (res.responseText.includes("unusual traffic")) { alert("⚠️ Google Scholar Blocked."); isStopped = true; resolve(null); return; } resolve(new DOMParser().parseFromString(res.responseText, "text/html")); }, onerror: () => resolve(null) }); }); }
    async function fetchAllArticlesList(userId) { let all = []; let cstart = 0; while (true && !isStopped) { const doc = await fetchHTML(`https://scholar.google.com/citations?user=${userId}&hl=th&cstart=${cstart}&pagesize=100`); if (!doc) return null; const links = doc.querySelectorAll('.gsc_a_t .gsc_a_at'); if (links.length === 0) break; links.forEach(l => all.push({ title: l.innerText, url: 'https://scholar.google.com' + l.getAttribute('href') })); if (links.length < 100) break; else { cstart += 100; await smartSleep(); } } return all; }
    function fetchArticleDeepDetail(url) { return new Promise((resolve) => { GM_xmlhttpRequest({ method: "GET", url: url, onload: (res) => { if (res.responseText.includes("unusual traffic")) { resolve("BLOCK"); return; } const doc = new DOMParser().parseFromString(res.responseText, "text/html"); const fields = doc.querySelectorAll('.gs_scl'); for (let row of fields) { const label = row.querySelector('.gsc_oci_field')?.innerText.trim().toLowerCase(); if (['ผู้เขียน', 'authors', 'ผู้คิดค้น', 'inventors'].includes(label)) { resolve(row.querySelector('.gsc_oci_value')?.innerText.trim()); return; } } resolve("ไม่ระบุ"); }, onerror: () => resolve("Error") }); }); }
    function getParameterByName(n, u) { const r = new RegExp('[?&]' + n + '(=([^&#]*)|&|#|$)'), res = r.exec(u); return (!res || !res[2]) ? null : decodeURIComponent(res[2].replace(/\+/g, ' ')); }

    function showGrandResultModal(masterData, mode) {
        const m = document.createElement('div'); m.id = 'gs-modal-print';
        Object.assign(m.style, { position: 'fixed', top: '2%', left: '2%', width: '96%', height: '96%', backgroundColor: 'white', zIndex: '10001', display: 'flex', flexDirection: 'column', boxShadow: '0 0 30px rgba(0,0,0,0.5)', borderRadius: '12px', overflow: 'hidden', fontFamily: 'Sarabun' });
        const topBar = document.createElement('div'); topBar.className = 'no-print';
        Object.assign(topBar.style, { padding: '20px 25px', backgroundColor: '#f8f9fa', borderBottom: '1px solid #eee', display: 'flex', justifyContent: 'space-between', alignItems: 'center' });
        const titleHeader = document.createElement('h2'); Object.assign(titleHeader.style, { margin: '0', color: '#333' }); titleHeader.innerText = `📊 สรุปผลการดำเนินงาน ${mode.toUpperCase()} ${dataRange ? `(${dataRange})` : ''}`;
        const controlGroup = document.createElement('div'); controlGroup.style.display = 'flex'; controlGroup.style.gap = '10px';
        const pdfBtn = document.createElement('button'); pdfBtn.innerText = '📄 Export PDF Report';
        Object.assign(pdfBtn.style, { padding: '10px 20px', backgroundColor: '#e74c3c', color: 'white', border: 'none', fontWeight: 'bold', borderRadius: '4px', cursor: 'pointer' });
        pdfBtn.onclick = () => { const ot = document.title; document.title = `Scholar_Report_${mode}_${dataRange || 'all'}_${getFormattedTimestamp()}`; window.print(); document.title = ot; };
        const csv = document.createElement('button'); csv.innerText = '📥 Download CSV';
        Object.assign(csv.style, { padding: '10px 20px', backgroundColor: '#2d3436', color: 'white', border: 'none', fontWeight: 'bold', borderRadius: '4px', cursor: 'pointer' });
        csv.onclick = () => {
            let c = "data:text/csv;charset=utf-8,\uFEFFAuthor,Alt Names,Title,Authors Found,Match,URL\n";
            masterData.forEach(p => { if (mode === 'profile' || p.articles.length === 0) { c += `"${p.authorName}","${p.altNames}","","","","${p.profileUrl}"\n`; }
                else { p.articles.forEach(a => {
                    let mStat = a.isFuzzy ? "Fuzzy Match" : (a.isMatch?'Yes':'No');
                    if (currentMode === 'basic') mStat = "N/A";
                    c += `"${p.authorName}","${p.altNames}","${a.title.replace(/"/g,'""')}","${a.authorsInArticle.replace(/<[^>]*>/g,'').replace(/"/g,'""')}","${mStat}","${a.url}"\n`;
                }); }
            });
            const l = document.createElement("a"); l.href = encodeURI(c); l.download = `scholar_report_${mode}_${dataRange || 'all'}_${getFormattedTimestamp()}.csv`; l.click();
        };
        const cb = document.createElement('button'); cb.innerText = 'ปิดหน้าต่าง'; Object.assign(cb.style, { padding: '10px 20px', backgroundColor: '#6c757d', color: 'white', border: 'none', fontWeight: 'bold', borderRadius: '4px', cursor: 'pointer' });
        cb.onclick = () => { document.title = originalTabTitle; m.remove(); };
        controlGroup.appendChild(pdfBtn); controlGroup.appendChild(csv); controlGroup.appendChild(cb);
        topBar.appendChild(titleHeader); topBar.appendChild(controlGroup);
        const list = document.createElement('div'); list.id = 'gs-modal-content'; list.style.flex = '1'; list.style.overflowY = 'auto'; list.style.padding = '15px';
        masterData.forEach((p, idx) => {
            const ph = document.createElement('div'); ph.style.padding = '14px'; ph.style.backgroundColor = '#f1f3f5'; ph.style.marginTop = '25px'; ph.style.borderRadius = '8px'; ph.style.fontWeight = 'bold';
            let statsHtml = "";
            if (mode === 'deep') {
                const matchC = p.articles.filter(a => a.isMatch).length;
                const mismatchC = p.articles.filter(a => !a.isMatch).length;
                statsHtml = ` <span style="font-size:12px; margin-left:10px; font-weight:normal;">(✅ <span style="color:#27ae60;">${matchC}</span> | ❌ <span style="color:#e74c3c;">${mismatchC}</span>)</span>`;
            }
            ph.innerHTML = `👤 ${idx+1}. ${p.authorName}${statsHtml} <a href="${p.profileUrl}" target="_blank" style="text-decoration:none;">🔗</a> ${p.altNames ? `<small style="color:#777;">(${p.altNames})</small>` : ''}`;
            list.appendChild(ph);
            p.articles.forEach((a, aIdx) => {
                const r = document.createElement('div'); r.style.borderBottom = '1px solid #f1f1f1'; r.style.padding = '10px 12px';
                if (mode === 'deep') {
                    r.style.backgroundColor = a.isMatch ? '#ebfaf0' : '#fff5f5';
                    const icon = a.isFuzzy ? '⚠️' : (a.isMatch ? '✅' : '❌');
                    r.innerHTML = `<div>${icon} ${aIdx+1}. ${a.title} <a href="${a.url}" target="_blank" style="text-decoration:none;">🔗</a></div><div style="font-size:12px;color:#888;margin-left:28px;">ผู้เขียน: ${a.authorsInArticle}</div>`;
                }
                else { r.innerHTML = `<div>${aIdx+1}. ${a.title} <a href="${a.url}" target="_blank" style="text-decoration:none;">🔗</a></div>`; }
                list.appendChild(r);
            });
        });
        m.appendChild(topBar); m.appendChild(list); document.body.appendChild(m);
    }
})();