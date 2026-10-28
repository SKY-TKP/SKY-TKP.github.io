/* Interactive calculators for two portfolio projects.
   1) Primogem budget: the exact engine from "How Many Primogems Are Enough?" (baseline hazards, Capturing Radiance Model A).
   2) BOM cost: the 6-step costing logic of the BOM Calculator, on dummy data.
   The engines are pure functions so they can be checked in Node against the paper's numbers. */
(function (root) {
    "use strict";

    // ---------- Primogem engine ----------
    function hazard(p0, delta, tau, tmax) {
        const h = new Float64Array(tmax + 1);          // h[t], t = 1..tmax
        for (let t = 1; t <= tmax; t++) h[t] = Math.min(1, p0 + delta * Math.max(0, t - tau));
        h[tmax] = 1;                                     // hard pity
        return h;
    }
    function pmfFromHazard(h) {                          // f(t) = h(t) S(t-1)
        const f = new Float64Array(h.length);
        let surv = 1;
        for (let t = 1; t < h.length; t++) { f[t] = h[t] * surv; surv *= 1 - h[t]; }
        return f;
    }
    function afterPity(f, pity) {                        // first wait when `pity` rolls are already spent
        if (!pity) return f;
        let tail = 0;
        for (let t = pity + 1; t < f.length; t++) tail += f[t];
        const g = new Float64Array(Math.max(2, f.length - pity));
        if (tail <= 0) { g[1] = 1; return g; }           // past the point where the hazard reaches 1
        for (let t = 1; t < f.length - pity; t++) g[t] = f[t + pity] / tail;
        return g;
    }
    function conv(a, b) {
        const out = new Float64Array(a.length + b.length - 1);
        for (let i = 0; i < a.length; i++) {
            const ai = a[i];
            if (ai === 0) continue;
            for (let j = 0; j < b.length; j++) out[i + j] += ai * b[j];
        }
        return out;
    }

    // Model A: from counter s, (probability, 5-stars used, next counter)
    const MODEL_A = [[[0.5, 1, 0], [0.5, 2, 1]], [[0.5, 1, 0], [0.5, 2, 2]], [[0.75, 1, 0], [0.25, 2, 3]], [[1, 1, 0]]];
    const STATIONARY_A = [16 / 29, 8 / 29, 4 / 29, 1 / 29];

    // law of the character 5-star count: [z^n] pi0 M(z)^copies 1, as a row-vector recursion
    function pmfNc(copies, pi0, guaranteed) {
        let state = pi0.map(p => { const poly = new Float64Array(1); poly[0] = p; return poly; });
        let left = copies;
        if (guaranteed) {                                // the held guarantee: first copy costs one 5-star, counter unchanged
            state = state.map(poly => { const q = new Float64Array(poly.length + 1); q.set(poly, 1); return q; });
            left -= 1;
        }
        for (let k = 0; k < left; k++) {
            const next = [0, 1, 2, 3].map(() => new Float64Array(state[0].length + 2));
            state.forEach((poly, s) => {
                for (const [p, g, s2] of MODEL_A[s]) for (let i = 0; i < poly.length; i++) next[s2][i + g] += p * poly[i];
            });
            state = next;
        }
        const out = new Float64Array(state[0].length);
        state.forEach(poly => poly.forEach((v, i) => { out[i] += v; }));
        return out;
    }
    function pmfNw(copies, fatePoint) {                  // y + Bin(y, 5/8); a held Fate Point makes the first copy cost one
        const out = new Float64Array(2 * copies + 1);
        if (!copies) { out[0] = 1; return out; }
        const rest = fatePoint ? copies - 1 : copies, base = fatePoint ? 1 : 0;
        let c = 1;                                       // binomial coefficient C(rest, k)
        for (let k = 0; k <= rest; k++) {
            out[base + rest + k] = c * Math.pow(5 / 8, k) * Math.pow(3 / 8, rest - k);
            c = c * (rest - k) / (k + 1);
        }
        return out;
    }
    function compound(pN, first, f) {                    // sum_n P(N = n) (first * f^{*(n-1)})
        let out = new Float64Array(1);
        if (pN[0]) out[0] = pN[0];
        let power = first;
        for (let n = 1; n < pN.length; n++) {
            if (pN[n]) {
                if (out.length < power.length) { const o = new Float64Array(power.length); o.set(out); out = o; }
                for (let i = 0; i < power.length; i++) out[i] += pN[n] * power[i];
            }
            if (n < pN.length - 1) power = conv(power, f);
        }
        return out;
    }

    const F_C = pmfFromHazard(hazard(0.006, 0.06, 73, 90));
    const F_W = pmfFromHazard(hazard(0.007, 0.07, 62, 80));

    function primogemPlan(o) {
        const pi0 = o.counter === "unknown" ? STATIONARY_A : [0, 1, 2, 3].map(s => (s === +o.counter ? 1 : 0));
        const pRc = compound(pmfNc(o.cons + 1, pi0, o.guaranteed), afterPity(F_C, o.charPity || 0), F_C);
        const pRw = compound(pmfNw(o.refine, o.fatePoint), afterPity(F_W, o.weapPity || 0), F_W);
        const pmf = conv(pRc, pRw);
        const cdf = new Float64Array(pmf.length);
        let acc = 0, mean = 0, sq = 0;
        for (let r = 0; r < pmf.length; r++) { acc += pmf[r]; cdf[r] = acc; mean += r * pmf[r]; sq += r * r * pmf[r]; }
        const q = p => { for (let r = 0; r < cdf.length; r++) if (cdf[r] >= p - 1e-12) return r; return cdf.length - 1; };
        const rolls = Math.floor((o.primogems || 0) / 160) + (o.fates || 0);
        const budget = o.starglitter ? Math.floor(rolls / (1 - 0.08)) : rolls;
        let shortfall = 0;
        for (let r = budget + 1; r < pmf.length; r++) shortfall += (r - budget) * pmf[r];
        const var95 = q(0.95);
        let tail = 0;
        for (let r = var95 + 1; r < pmf.length; r++) tail += (r - var95) * pmf[r];
        return {
            pmf, cdf, rolls, budget,
            success: budget >= cdf.length ? 1 : cdf[budget],
            mean, sd: Math.sqrt(Math.max(0, sq - mean * mean)),
            q50: q(0.5), q90: q(0.9), q95: var95, q99: q(0.99),
            cvar95: var95 + tail / 0.05,
            shortfall
        };
    }

    // ---------- BOM costing (dummy data) ----------
    const BOM_LINES = [
        { sku: "RAW-0002", name: "Ethanol 96%", group: "solvent", share: 0.95, unit: "L", gPerUnit: 800, pack: 20, moq: 20, price: 60, cur: "THB" },
        { sku: "RAW-0001", name: "Deionized water", group: "solvent", share: 0.05, unit: "kg", gPerUnit: 1000, pack: 20, moq: 20, price: 10, cur: "THB" },
        { sku: "FRG-0001", name: "Citrus Accord A", group: "fragrance", share: 0.70, unit: "kg", gPerUnit: 1000, pack: 1, moq: 5, price: 1800, cur: "THB" },
        { sku: "FRG-0002", name: "Musk Base B", group: "fragrance", share: 0.30, unit: "kg", gPerUnit: 1000, pack: 1, moq: 1, price: 60, cur: "USD" },
        { sku: "PKG-0002", name: "Glass bottle 100 ml", perPiece: 1, unit: "pc", pack: 100, moq: 1000, price: 12, cur: "THB" },
        { sku: "PKG-0003", name: "Spray pump 24/410", perPiece: 1, unit: "pc", pack: 500, moq: 500, price: 4.5, cur: "THB" },
        { sku: "PKG-0001", name: "Gift box", perPiece: 1, unit: "pc", pack: 50, moq: 500, price: 6, cur: "THB" }
    ];
    function bomCost(o) {
        const groupPct = { solvent: 1 - o.fragrancePct / 100, fragrance: o.fragrancePct / 100 };
        const lines = BOM_LINES.map(l => {
            const liquid = !!l.group;
            const grams = liquid ? o.liquidG * groupPct[l.group] * l.share : null;
            const use = liquid ? grams / l.gPerUnit : l.perPiece;                       // 1) per piece, purchase units
            const need = use * o.qty * (1 + (liquid ? o.lossLiquid : o.lossOther) / 100); // 2) need with loss
            const order = Math.ceil(Math.max(need, l.moq) / l.pack - 1e-9) * l.pack;    // 3) up to MOQ, then whole packs
            const priceThb = l.price * (l.cur === "USD" ? o.usdThb : 1);                // 4) THB per unit
            return Object.assign({}, l, { grams, use, need, order, priceThb,
                orderThb: order * priceThb, perPiece: o.qty ? need * priceThb / o.qty : 0 }); // 5) order and per piece
        });
        const sum = k => lines.reduce((a, l) => a + l[k], 0);
        const materialsPc = sum("perPiece"), orderThb = sum("orderThb");
        const fixedPc = o.qty ? o.fixed / o.qty : 0;
        return { lines, materialsPc, orderThb, extraThb: orderThb - materialsPc * o.qty,  // 6) totals
                 costPc: materialsPc + o.feePc + fixedPc, lotThb: orderThb + o.feePc * o.qty + o.fixed };
    }

    const api = { primogemPlan, bomCost, F_C, F_W };
    if (typeof module !== "undefined" && module.exports) { module.exports = api; return; }
    root.Calculators = api;

    // ---------- UI: both popups update live on every input ----------
    const $ = id => document.getElementById(id);
    const nf0 = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
    const nf2 = new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const clamp = (el, lo, hi, whole) => {
        let v = Number(el.value);
        if (!Number.isFinite(v)) v = lo;
        if (whole) v = Math.floor(v);
        return Math.min(hi, Math.max(lo, v));
    };
    function live(form, render) {
        let timer = 0;                                    // a timer, not rAF: rAF pauses in background tabs
        const go = () => { clearTimeout(timer); timer = setTimeout(render, 16); };
        form.addEventListener("input", go);
        form.addEventListener("change", go);
        form.addEventListener("submit", e => e.preventDefault());
        render();
    }
    function setValues(form, values) {
        for (const [k, v] of Object.entries(values)) {
            const el = form.elements[k];
            if (el.type === "checkbox") el.checked = v; else el.value = v;
        }
    }

    const PC_DEFAULTS = { cons: "2", refine: "1", primogems: 64000, fates: 0, starglitter: false, counter: "3", guaranteed: false, charPity: 0, weapPity: 0, fatePoint: false };
    const SG = 1 - 0.08;                                  // raw rolls per roll once Starglitter is recycled

    function initPrimogems() {
        const form = $("pc-form");
        if (!form) return;
        const el = form.elements;
        function render() {
            const refine = +el.refine.value;
            el.weapPity.disabled = el.fatePoint.disabled = refine === 0;
            const o = {
                cons: +el.cons.value, refine,
                primogems: clamp(el.primogems, 0, 9999999, true), fates: clamp(el.fates, 0, 99999, true),
                starglitter: el.starglitter.checked, counter: el.counter.value, guaranteed: el.guaranteed.checked,
                charPity: clamp(el.charPity, 0, 89, true), weapPity: refine ? clamp(el.weapPity, 0, 76, true) : 0,
                fatePoint: refine > 0 && el.fatePoint.checked
            };
            const r = primogemPlan(o);
            const k = o.starglitter ? SG : 1;
            const safe = Math.ceil(r.q90 * k - 1e-9);     // raw rolls that reach the 90% budget
            $("pc-target").textContent = "Chance to reach C" + o.cons + (refine ? "R" + refine : "");
            $("pc-success").textContent = r.success >= 0.99995 ? ">99.99%" : (100 * r.success).toFixed(2) + "%";
            $("pc-budget").textContent = "with " + nf0.format(r.rolls) + " rolls" + (o.starglitter ? " (" + nf0.format(r.budget) + " after Starglitter)" : "");
            $("pc-bar").style.width = (100 * r.success).toFixed(2) + "%";
            $("pc-mean").textContent = nf0.format(160 * r.mean * k);
            $("pc-q90").textContent = nf0.format(160 * safe);
            $("pc-more").textContent = nf0.format(160 * Math.max(0, safe - r.rolls));
            $("pc-topup").textContent = nf0.format(160 * r.shortfall * k);
            drawChart(r, k, safe);
        }
        $("pc-reset").addEventListener("click", () => { setValues(form, PC_DEFAULTS); render(); });
        live(form, render);
    }

    function drawChart(r, k, safe) {
        const W = 560, H = 240, L = 44, R = 16, T = 30, B = 26;
        const cdf = r.cdf, last = cdf.length - 1;
        const qAt = p => { for (let i = 0; i <= last; i++) if (cdf[i] >= p) return i; return last; };
        const eff = raw => Math.min(last, Math.floor(raw / k + 1e-9));
        let lo = Math.max(0, Math.floor(qAt(0.001) * k) - 4), hi = Math.ceil(qAt(0.999) * k) + 4;
        const span0 = hi - lo;
        if (r.rolls < lo && r.rolls >= lo - span0 * 0.6) lo = Math.max(0, r.rolls - 4);   // stretch to show the budget,
        if (r.rolls > hi && r.rolls <= hi + span0 * 0.6) hi = r.rolls + 4;               // but not so far the curve flattens
        const X = raw => L + (raw - lo) / (hi - lo) * (W - L - R);
        const Y = p => T + (1 - p) * (H - T - B);
        const step = Math.max(1, Math.floor((hi - lo) / 300));
        const pts = [];
        for (let raw = lo; raw <= hi; raw += step) pts.push([X(raw), Y(cdf[eff(raw)])]);
        const line = pts.map((p, i) => (i ? "L" : "M") + p[0].toFixed(1) + " " + p[1].toFixed(1)).join(" ");
        const cut = Math.min(Math.max(r.rolls, lo), hi);
        const under = pts.filter(p => p[0] <= X(cut) + 0.01);
        const area = under.length ? "M" + X(lo).toFixed(1) + " " + Y(0) + " " + under.map(p => "L" + p[0].toFixed(1) + " " + p[1].toFixed(1)).join(" ") + " L" + under[under.length - 1][0].toFixed(1) + " " + Y(0) + " Z" : "";
        let out = "";
        for (const p of [0, 0.25, 0.5, 0.75, 1]) {
            out += `<line class="calc-grid-line" x1="${L}" x2="${W - R}" y1="${Y(p)}" y2="${Y(p)}"/><text class="calc-axis" x="${L - 6}" y="${Y(p) + 3.5}" text-anchor="end">${p * 100}%</text>`;
        }
        const spanG = (hi - lo) * 160;
        const tick = [5000, 10000, 20000, 25000, 50000, 100000].find(s => spanG / s <= 6) || 200000;
        for (let g = Math.ceil(lo * 160 / tick) * tick; g <= hi * 160; g += tick) {
            out += `<text class="calc-axis" x="${X(g / 160).toFixed(1)}" y="${H - 8}" text-anchor="middle">${g / 1000}k</text>`;
        }
        out += `<path class="calc-area" d="${area}"/><path class="calc-curve" d="${line}"/>`;
        const marks = [];
        if (safe >= lo && safe <= hi) marks.push(["safe", X(safe), "90% · " + (160 * safe / 1000).toFixed(1) + "k"]);
        if (r.rolls >= lo && r.rolls <= hi) marks.push(["you", X(r.rolls), "You · " + (r.success >= 0.99995 ? ">99.99" : (100 * r.success).toFixed(1)) + "%"]);
        marks.sort((a, b) => a[1] - b[1]);
        const close = marks.length === 2 && marks[1][1] - marks[0][1] < 110;
        marks.forEach(([cls, x, label], i) => {
            let anchor = x > W - 90 ? "end" : x < L + 50 ? "start" : "middle", tx = x;
            if (close) { anchor = i ? "start" : "end"; tx = x + (i ? 5 : -5); }   // close lines: labels go outward
            out += `<line class="calc-${cls}" x1="${x.toFixed(1)}" x2="${x.toFixed(1)}" y1="${T - 8}" y2="${Y(0)}"/><text class="calc-lbl calc-lbl-${cls}" x="${tx.toFixed(1)}" y="${T - 12}" text-anchor="${anchor}">${label}</text>`;
        });
        $("pc-chart").innerHTML = out;
    }

    const BC_DEFAULTS = { qty: 1000, liquidG: 80, fragrancePct: 15, lossLiquid: 5, lossOther: 3, usdThb: 35 };

    function initBom() {
        const form = $("bc-form");
        if (!form) return;
        const el = form.elements;
        const qty = n => (Number.isInteger(n) ? nf0.format(n) : nf2.format(n));
        function render() {
            const o = {
                qty: clamp(el.qty, 1, 1000000, true), liquidG: clamp(el.liquidG, 1, 1000), fragrancePct: clamp(el.fragrancePct, 0, 100),
                lossLiquid: clamp(el.lossLiquid, 0, 50), lossOther: clamp(el.lossOther, 0, 50), usdThb: clamp(el.usdThb, 1, 100),
                feePc: 5, fixed: 3000
            };
            $("bc-frag-out").textContent = o.fragrancePct + "%";
            const r = bomCost(o);
            $("bc-cost").textContent = nf2.format(r.costPc);
            $("bc-batch").textContent = "THB per piece, batch of " + nf0.format(o.qty);
            $("bc-lot").textContent = nf0.format(r.lotThb);
            $("bc-mat").textContent = nf2.format(r.materialsPc);
            $("bc-extra").textContent = nf0.format(r.extraThb);
            $("bc-other").textContent = nf2.format(o.feePc + o.fixed / o.qty);
            $("bc-lines").innerHTML = r.lines.map(l =>
                `<tr><td title="${l.sku}">${l.name}</td><td>${qty(+l.need.toFixed(2))} ${l.unit}</td><td>${qty(l.order)} ${l.unit}</td><td>${nf2.format(l.orderThb)}</td><td>${l.perPiece.toFixed(4)}</td></tr>`).join("");
        }
        $("bc-reset").addEventListener("click", () => { setValues(form, BC_DEFAULTS); render(); });
        live(form, render);
    }

    function init() { initPrimogems(); initBom(); }
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
})(typeof window !== "undefined" ? window : globalThis);
