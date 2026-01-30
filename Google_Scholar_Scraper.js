// ==UserScript==
// @name         Google Scholar Scraper V.19
// @namespace    http://tampermonkey.net/
// @version      19.0
// @description  Google Scholar Scraper with 3 modes (Profile/Basic/Deep), Author validation, and CSV Export.
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

    // --- Config ---
    const DELAY_DEEP_MIN = 2000;
    const DELAY_DEEP_MAX = 5000;
    const DELAY_BASIC_MIN = 500;
    const DELAY_BASIC_MAX = 1000;

    let isPaused = false;
    let isStopped = false;
    let currentMode = 'deep'; // 'profile', 'basic', 'deep'

    let globalStats = { processedAuthors: 0, totalAuthors: 0, totalMatches: 0, totalMismatches: 0 };

    window.addEventListener('load', () => {
        createUI();
    });

    function createUI() {
        const container = document.createElement('div');
        Object.assign(container.style, {
            position: 'fixed',
            bottom: '30px',
            right: '30px',
            zIndex: '9999',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px',
            padding: '20px',
            backgroundColor: 'rgba(255, 255, 255, 0.85)',
            backdropFilter: 'blur(10px)',
            borderRadius: '16px',
            boxShadow: '0 8px 32px rgba(0, 0, 0, 0.1)',
            border: '1px solid rgba(255, 255, 255, 0.3)',
            transition: 'all 0.3s ease',
            fontFamily: "'Sarabun', sans-serif"
        });

        const scriptVersion = (typeof GM_info !== 'undefined') ? GM_info.script.version : '19.0';

        const title = document.createElement('div');
        title.innerText = `🤖 Scholar Tools v${scriptVersion}`;
        Object.assign(title.style, {
            fontSize: '12px',
            fontWeight: 'bold',
            color: '#555',
            marginBottom: '5px',
            textAlign: 'center',
            textTransform: 'uppercase',
            letterSpacing: '1px'
        });
        container.appendChild(title);

        function createStylishButton(text, gradientColors, onClick) {
            const btn = document.createElement('button');
            btn.innerHTML = text;
            Object.assign(btn.style, {
                padding: '12px 24px',
                background: `linear-gradient(135deg, ${gradientColors[0]}, ${gradientColors[1]})`,
                color: 'white',
                border: 'none',
                borderRadius: '50px',
                cursor: 'pointer',
                fontWeight: '600',
                fontSize: '14px',
                boxShadow: '0 4px 15px rgba(0,0,0,0.2)',
                textAlign: 'left',
                width: '100%',
                minWidth: '240px',
                whiteSpace: 'nowrap',
                transition: 'transform 0.2s, box-shadow 0.2s',
                display: 'flex',
                alignItems: 'center',
                gap: '10px'
            });

            btn.onmouseenter = () => {
                btn.style.transform = 'translateY(-2px)';
                btn.style.boxShadow = '0 6px 20px rgba(0,0,0,0.3)';
            };
            btn.onmouseleave = () => {
                btn.style.transform = 'translateY(0)';
                btn.style.boxShadow = '0 4px 15px rgba(0,0,0,0.2)';
            };

            btn.onclick = onClick;
            return btn;
        }

        const btnProfile = createStylishButton(
            '👤 1. รายชื่อ <span style="font-size:12px; opacity:0.8">(Profile)</span>',
            ['#11998e', '#38ef7d'],
            () => startGrandProcess('profile')
        );

        const btnBasic = createStylishButton(
            '⚡ 2. บทความ <span style="font-size:12px; opacity:0.8">(Articles)</span>',
            ['#FF8008', '#FFC837'],
            () => startGrandProcess('basic')
        );

        const btnDeep = createStylishButton(
            '🛡️ 3. ตรวจสอบ <span style="font-size:12px; opacity:0.8">(Deep Dive)</span>',
            ['#CB356B', '#BD3F32'],
            () => startGrandProcess('deep')
        );

        container.appendChild(btnProfile);
        container.appendChild(btnBasic);
        container.appendChild(btnDeep);
        document.body.appendChild(container);
    }

    // --- Dashboard UI ---
    function createDashboard(mode) {
        const old = document.getElementById('gs-dashboard');
        if (old) old.remove();

        const dash = document.createElement('div');
        dash.id = 'gs-dashboard';
        Object.assign(dash.style, {
            position: 'fixed', top: '10px', right: '10px', width: '300px',
            backgroundColor: 'rgba(0,0,0,0.9)', color: '#fff', padding: '15px',
            borderRadius: '10px', zIndex: '10000', fontSize: '14px',
            boxShadow: '0 5px 15px rgba(0,0,0,0.5)', fontFamily: 'Sarabun, sans-serif'
        });

        let modeText = '';
        if (mode === 'profile') modeText = '👤 Profile Mode (Lvl 1)';
        else if (mode === 'basic') modeText = '⚡ Article Mode (Lvl 2)';
        else modeText = '🛡️ Deep Mode (Lvl 3)';

        dash.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
                <h3 style="margin:0; color:#f1c40f;">${modeText}</h3>
                <span style="font-size:12px; color:#aaa;">Running</span>
            </div>
            <div id="gs-author-info" style="font-weight:bold; color:#fff; margin-bottom:5px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                รอเริ่มทำงาน...
            </div>
            <div id="gs-article-info" style="font-size:12px; color:#ccc; margin-bottom:15px;">-</div>
            <div style="display:flex; gap:10px; margin-bottom:10px;">
                <button id="gs-btn-pause" style="flex:1; padding:8px; cursor:pointer; background:#e67e22; border:none; color:white; font-weight:bold; border-radius:4px;">⏸ พัก (Pause)</button>
                <button id="gs-btn-stop" style="flex:1; padding:8px; cursor:pointer; background:#c0392b; border:none; color:white; font-weight:bold; border-radius:4px;">⏹ หยุด (Stop)</button>
            </div>
            <div style="font-size:12px; color:#aaa; text-align:center; border-top:1px solid #444; padding-top:5px;">
                *หากเจอ CAPTCHA ให้กดพัก แก้แล้วกดทำต่อ
            </div>
        `;

        document.body.appendChild(dash);

        document.getElementById('gs-btn-pause').onclick = function() {
            isPaused = !isPaused;
            this.innerText = isPaused ? "▶ ทำต่อ (Resume)" : "⏸ พัก (Pause)";
            this.style.background = isPaused ? "#27ae60" : "#e67e22";
        };

        document.getElementById('gs-btn-stop').onclick = function() {
            if(confirm("ต้องการหยุดและสรุปผลทันทีหรือไม่?")) {
                isStopped = true;
                isPaused = false;
            }
        };
    }

    function updateDashboardUI(currentAuthorName, currentArticleTitle, artIndex, artTotal) {
        const authorEl = document.getElementById('gs-author-info');
        const articleEl = document.getElementById('gs-article-info');

        if(authorEl) authorEl.innerHTML = `[${globalStats.processedAuthors}/${globalStats.totalAuthors}] 👤 ${currentAuthorName}`;

        if(articleEl) {
            if (currentMode === 'profile') {
                articleEl.innerText = "✅ เก็บข้อมูลโปรไฟล์เรียบร้อย";
            } else if (currentArticleTitle) {
                const action = currentMode === 'deep' ? 'ตรวจสอบ' : 'ดึงข้อมูล';
                articleEl.innerText = `📄 [${artIndex}/${artTotal}] ${action}: "${currentArticleTitle.substring(0, 30)}..."`;
            }
        }
    }

    async function smartSleep() {
        while (isPaused) { await new Promise(r => setTimeout(r, 1000)); }
        if (currentMode === 'profile') { await new Promise(r => setTimeout(r, 200)); return; }

        let min = currentMode === 'deep' ? DELAY_DEEP_MIN : DELAY_BASIC_MIN;
        let max = currentMode === 'deep' ? DELAY_DEEP_MAX : DELAY_BASIC_MAX;
        const ms = Math.floor(Math.random() * (max - min + 1) + min);
        await new Promise(r => setTimeout(r, ms));
    }

    // --- Main Process ---
    async function startGrandProcess(mode) {
        currentMode = mode;
        createDashboard(mode);
        isPaused = false;
        isStopped = false;
        globalStats = { processedAuthors: 0, totalAuthors: 0, totalMatches: 0, totalMismatches: 0 };

        const authorItems = document.querySelectorAll('.gs_ai_name a');
        if (authorItems.length === 0) {
            alert("❌ ไม่พบรายชื่อนักวิจัย");
            return;
        }

        globalStats.totalAuthors = authorItems.length;
        let masterData = [];

        for (let i = 0; i < authorItems.length; i++) {
            if (isStopped) break;

            globalStats.processedAuthors = i + 1;
            const item = authorItems[i];
            const authorName = item.innerText;

            let profileUrl = item.getAttribute('href');
            if (profileUrl && !profileUrl.startsWith('http')) profileUrl = 'https://scholar.google.com' + profileUrl;
            const userId = getParameterByName('user', profileUrl);

            updateDashboardUI(authorName, "กำลังเริ่ม...", "-", "-");
            let detailedArticles = [];

            if (mode === 'profile') {
                updateDashboardUI(authorName, null, 0, 0);
                await smartSleep();
            } else {
                const articlesList = await fetchAllArticlesList(userId);
                if (isStopped) break;

                for (let j = 0; j < articlesList.length; j++) {
                    if (isStopped) break;

                    const art = articlesList[j];
                    updateDashboardUI(authorName, art.title, j + 1, articlesList.length);

                    let authorsInArticle = "-";
                    let isMatch = null;

                    if (mode === 'deep') {
                        await smartSleep();
                        authorsInArticle = await fetchArticleDeepDetail(art.url);
                        isMatch = checkNameMatch(authorName, authorsInArticle);
                        if (isMatch) globalStats.totalMatches++; else globalStats.totalMismatches++;
                    }
                    detailedArticles.push({ title: art.title, url: art.url, authorsInArticle: authorsInArticle, isMatch: isMatch });
                }
            }
            masterData.push({ authorName: authorName, profileUrl: profileUrl, articles: detailedArticles });
            await smartSleep();
        }
        document.getElementById('gs-dashboard').remove();
        showGrandResultModal(masterData, mode);
    }

    // --- Helper Functions ---
    async function fetchAllArticlesList(userId) {
        let allArticles = [];
        let cstart = 0;
        let pageSize = 100;
        let hasMore = true;
        while (hasMore && !isStopped) {
            let targetUrl = `https://scholar.google.com/citations?user=${userId}&hl=th&cstart=${cstart}&pagesize=${pageSize}&view_op=list_works&sortby=pubdate`;
            try {
                await smartSleep();
                const doc = await fetchHTML(targetUrl);
                const links = doc.querySelectorAll('.gsc_a_t .gsc_a_at');
                if (links.length === 0) { hasMore = false; break; }
                links.forEach(link => {
                    let u = link.getAttribute('href');
                    if (u && !u.startsWith('http')) u = 'https://scholar.google.com' + u;
                    allArticles.push({ title: link.innerText, url: u });
                });
                const moreBtn = doc.getElementById('gsc_bpf_more');
                if (!moreBtn || moreBtn.disabled || moreBtn.classList.contains('gs_btn_dis') || links.length < pageSize) hasMore = false;
                else cstart += pageSize;
            } catch (e) { hasMore = false; }
        }
        return allArticles;
    }

    function fetchArticleDeepDetail(url) {
        return new Promise((resolve) => {
            GM_xmlhttpRequest({
                method: "GET", url: url,
                onload: function(response) {
                    const parser = new DOMParser();
                    const doc = parser.parseFromString(response.responseText, "text/html");
                    const fields = doc.querySelectorAll('.gs_scl');
                    let foundData = "ไม่ระบุ";
                    for (let row of fields) {
                        const labelDiv = row.querySelector('.gsc_oci_field');
                        const valueDiv = row.querySelector('.gsc_oci_value');
                        if (labelDiv && valueDiv) {
                            const label = labelDiv.innerText.trim().toLowerCase();
                            if (['ผู้เขียน', 'authors', 'ผู้คิดค้น', 'inventors'].includes(label)) { foundData = valueDiv.innerText.trim(); break; }
                        }
                    }
                    resolve(foundData);
                },
                onerror: () => resolve("Error Fetching")
            });
        });
    }

    function checkNameMatch(mainAuthor, articleAuthors) {
        if (!articleAuthors || articleAuthors === "ไม่ระบุ") return false;
        const cleanMain = normalizeName(mainAuthor);
        const cleanArticleAuths = normalizeName(articleAuthors);
        return cleanArticleAuths.includes(cleanMain);
    }

    function normalizeName(name) {
        if (!name) return "";
        let n = name.toLowerCase();

        if (n.includes(',')) {
            n = n.split(',')[0]; 
        }

        const prefixes = /^(mr\.|mrs\.|ms\.|dr\.|prof\.|asst\.|assoc\.|นาย|นาง|นางสาว|ดร\.|ผศ\.|รศ\.|ศ\.|อาจารย์|พล\.?t\.?|pol\.?)\s*/i;
        n = n.replace(prefixes, '');

        const suffixes = /\s*(ph\.d\.|ed\.d\.|m\.sc\.|b\.sc\.|b\.a\.|m\.a\.|d\.phil\.|f\.r\.s\.)/gi;
        n = n.replace(suffixes, '');

        n = n.replace(/[.,]/g, '');
        
        n = n.replace(/\s+/g, ' ');
        return n.trim();
    }

    function fetchHTML(url) {
        return new Promise((resolve, reject) => {
            GM_xmlhttpRequest({ method: "GET", url: url, onload: (res) => resolve(new DOMParser().parseFromString(res.responseText, "text/html")), onerror: reject });
        });
    }

    function getParameterByName(name, url) {
        if (!url) url = window.location.href;
        name = name.replace(/[\[\]]/g, '\\$&');
        var regex = new RegExp('[?&]' + name + '(=([^&#]*)|&|#|$)'), results = regex.exec(url);
        if (!results) return null;
        if (!results[2]) return '';
        return decodeURIComponent(results[2].replace(/\+/g, ' '));
    }

    // --- Result UI ---
    function showGrandResultModal(masterData, mode) {
        const modal = document.createElement('div');
        Object.assign(modal.style, {
            position: 'fixed', top: '2%', left: '2%', width: '96%', height: '96%',
            backgroundColor: 'white', border: '1px solid #ccc', zIndex: '10001',
            padding: '0', display: 'flex', flexDirection: 'column',
            boxShadow: '0 0 25px rgba(0,0,0,0.5)', borderRadius: '8px', overflow: 'hidden'
        });

        let statsHTML = '';
        if (mode === 'deep') {
            statsHTML = `รวม: <b>${globalStats.totalMatches + globalStats.totalMismatches}</b> บทความ | <span style="color:green;">✅ ตรงกัน: <b>${globalStats.totalMatches}</b></span> | <span style="color:red;">❌ ไม่ตรง: <b>${globalStats.totalMismatches}</b></span>`;
        } else if (mode === 'basic') {
            statsHTML = `โหมดบทความ (Basic): ดึงชื่อเรื่องและ URL เท่านั้น`;
        } else {
            statsHTML = `โหมดรายชื่อ (Profile): ดึงข้อมูลนักวิจัย ${masterData.length} ท่าน`;
        }

        const header = document.createElement('div');
        header.style.padding = '20px';
        header.style.backgroundColor = '#f1f3f4';
        header.style.borderBottom = '1px solid #ddd';
        header.innerHTML = `<h2 style="margin:0 0 10px 0;">สรุปผลการดึงข้อมูล (${mode === 'profile' ? 'Profile' : mode === 'basic' ? 'Basic' : 'Deep'})</h2><div>${statsHTML}</div>`;

        const listContainer = document.createElement('div');
        listContainer.style.flex = '1';
        listContainer.style.overflowY = 'auto';
        listContainer.style.padding = '10px';
        listContainer.style.backgroundColor = '#fafafa';

        masterData.forEach((person, pIdx) => {
            const authorLink = `<a href="${person.profileUrl}" target="_blank" style="text-decoration:none; margin-left:5px; font-size:16px;" title="ไปที่โปรไฟล์">🔗</a>`;
            let articleCountText = mode === 'profile' ? '' : `(${person.articles.length} เรื่อง)`;
            let personHeaderHTML = `👤 ${pIdx+1}. ${person.authorName} ${authorLink} ${articleCountText}`;

            if (mode === 'deep') {
                const localMatch = person.articles.filter(a => a.isMatch).length;
                const localMismatch = person.articles.length - localMatch;
                personHeaderHTML += `<span style="margin-left:15px; font-weight:normal; font-size:14px;">| <span style="color:green">✅ ตรง: <b>${localMatch}</b></span> | <span style="color:red">❌ ไม่ตรง: <b>${localMismatch}</b></span></span>`;
            }

            const personHeader = document.createElement('div');
            personHeader.style.padding = '12px';
            personHeader.style.backgroundColor = '#e8eaed';
            personHeader.style.marginTop = '20px';
            personHeader.style.borderRadius = '5px';
            personHeader.style.fontWeight = 'bold';
            personHeader.style.border = '1px solid #ccc';
            personHeader.innerHTML = personHeaderHTML;
            listContainer.appendChild(personHeader);

            if (mode !== 'profile') {
                person.articles.forEach((item, idx) => {
                    const row = document.createElement('div');
                    row.style.borderBottom = '1px solid #eee';
                    row.style.padding = '8px 10px';
                    row.style.marginLeft = '10px';

                    const articleLink = `<a href="${item.url}" target="_blank" style="text-decoration:none; margin-left:5px; font-size:14px;" title="ไปที่บทความ">🔗</a>`;
                    let icon = '📄';
                    let titleStyle = '';
                    let detailText = '';

                    if (mode === 'deep') {
                        row.style.backgroundColor = item.isMatch ? '#e6fffa' : '#fff5f5';
                        icon = item.isMatch ? '✅' : '❌';
                        titleStyle = item.isMatch ? '' : 'color: red; font-weight:bold;';
                        detailText = `<div style="margin-left: 25px; color: #555; font-size: 13px;">author: ${item.authorsInArticle}</div>`;
                    } else {
                        row.style.backgroundColor = '#fff';
                    }

                    row.innerHTML = `<div style="font-size:14px; ${titleStyle}">${icon} ${idx+1}. ${item.title} ${articleLink}</div>${detailText}`;
                    listContainer.appendChild(row);
                });
            }
        });

        const footer = document.createElement('div');
        footer.style.padding = '15px';
        footer.style.backgroundColor = '#f1f3f4';
        footer.style.borderTop = '1px solid #ddd';
        footer.style.display = 'flex';
        footer.style.justifyContent = 'space-between';

        const btnClose = document.createElement('button');
        btnClose.innerText = 'ปิดหน้าต่าง';
        btnClose.style.padding = '10px 20px';
        btnClose.onclick = () => modal.remove();

        const btnCsv = document.createElement('button');
        btnCsv.innerText = '📥 Download CSV';
        btnCsv.style.padding = '10px 20px';
        btnCsv.style.backgroundColor = '#00796b';
        btnCsv.style.color = 'white';
        btnCsv.style.border = 'none';
        btnCsv.style.fontWeight = 'bold';

        btnCsv.onclick = () => {
            let csv = "data:text/csv;charset=utf-8,\uFEFF";
            if (mode === 'profile') {
                 csv += "Author Name,Profile URL\n";
                 masterData.forEach(p => { csv += `"${p.authorName}","${p.profileUrl}"\n`; });
            } else {
                csv += "Author Name,Article Title,Authors/Inventors (Fetched),Match Status,Article URL,Profile URL\n";
                masterData.forEach(p => {
                    p.articles.forEach(a => {
                        let matchStatus = mode === 'deep' ? (a.isMatch ? 'Yes' : 'No') : '-';
                        csv += `"${p.authorName}","${a.title.replace(/"/g, '""')}","${a.authorsInArticle.replace(/"/g, '""')}","${matchStatus}","${a.url}","${p.profileUrl}"\n`;
                    });
                });
            }
            const link = document.createElement("a");
            link.href = encodeURI(csv);
            link.download = `scholar_result_${mode}.csv`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        };

        footer.appendChild(btnClose);
        footer.appendChild(btnCsv);
        modal.appendChild(header);
        modal.appendChild(listContainer);
        modal.appendChild(footer);
        document.body.appendChild(modal);
    }
})();
