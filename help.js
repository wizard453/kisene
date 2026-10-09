/* Kišenė: pagalba, sąvokų žodynėlis ir finansų valdymo pamokos. */
"use strict";

S.help = S.help || {lesson: null};

/* ---------- Pagalbiniai skaičiavimai pamokoms ---------- */
const NEEDS = ["food", "home", "utilities", "transport", "health", "loan", "insurance"];
function helpStats() {
  const now = ymOf(todayISO());
  const txs = [...S.txs.values()];
  const months = dataMonths(txs, now);
  let inc = 0, exp = 0, needs = 0, n = 0;
  for (const m of months) {
    const a = monthAgg(m, txs);
    if (!a.n) continue;
    n++; inc += a.inc; exp += a.exp;
    needs += NEEDS.reduce((s, id) => s + (a.byCat[id] || 0), 0);
  }
  if (!n) return null;
  return {inc: inc / n, exp: exp / n, needs: needs / n, wants: (exp - needs) / n, months: n};
}
const splitBar = parts => `<div class="split">${parts.map(([label, share, col]) => `<span style="flex:${Math.max(share, 0.001)};background:var(--${col})">${share >= 12 ? label : ""}</span>`).join("")}</div>`;
const calcRows = rows => `<div class="calc">${rows.map(([k, v]) => `<span>${k}</span><b class="num">${v}</b>`).join("")}</div>`;
function noData() { return `<p>Kai programėlėje bus bent vieno pilno mėnesio operacijų, čia pamatysi skaičiavimą pagal savo duomenis.</p>`; }

/* ---------- Pamokos ---------- */
const LESSONS = [
  {id: "503020", t: "50/30/20 taisyklė", short: "Paprasčiausias būdas padalinti pajamas", col: "c1", ic: "percent",
    intro: "Pajamas po mokesčių padalink į tris dalis: 50 % būtiniems poreikiams, 30 % norams ir 20 % taupymui ar skoloms grąžinti. Šį metodą išpopuliarino Elizabeth Warren ir Amelia Warren Tyagi knygoje „All Your Worth“.",
    how: ["Būtiniems poreikiams priskirk tai, be ko neišsiverstum: būstą, komunalinius, maistą parduotuvėje, transportą, sveikatą, draudimą ir minimalias paskolų įmokas.",
      "Norams priskirk kavines, pramogas, prenumeratas, drabužius, keliones ir panašius dalykus.",
      "20 % pervesk į taupymą ar investicijas iškart gavęs atlyginimą, ne mėnesio pabaigoje."],
    app: ["Skiltyje Biudžetai nustatyk ribas taip, kad būtinų kategorijų suma būtų apie pusę pajamų.",
      "Sukurk taupymo tikslą ir kas mėnesį įnešk 20 % pajamų.",
      "Apžvalgoje stebėk, kiek liko laisvų pinigų."],
    pros: "Lengva prisiminti ir pradėti, nereikia sekti kiekvieno euro.",
    cons: "Brangiame mieste būtinoms išlaidoms 50 % gali neužtekti. Tada pradėk nuo 60/30/10 ir pamažu artėk prie 20 % taupymo.",
    calc() {
      const st = helpStats(); if (!st || st.inc <= 0) return noData();
      const save = st.inc - st.exp, pc = v => Math.round(v / st.inc * 100);
      return `<p>Tavo paskutinių ${st.months} mėn. vidurkis:</p>
        ${splitBar([["Būtina " + pc(st.needs) + " %", pc(st.needs), "c2"], ["Norai " + pc(st.wants) + " %", pc(st.wants), "c5"], ["Taupyta " + Math.max(0, pc(save)) + " %", Math.max(0, pc(save)), "c3"]])}
        ${calcRows([["Pajamos per mėnesį", eur0(st.inc)], ["Būtina (tikslas 50 %)", `${eur0(st.needs)} / ${eur0(st.inc * .5)}`], ["Norai (tikslas 30 %)", `${eur0(st.wants)} / ${eur0(st.inc * .3)}`], ["Taupymas (tikslas 20 %)", `${eur0(save)} / ${eur0(st.inc * .2)}`]])}
        <p class="fine">Būtinomis laikomos kategorijos: maistas, būstas, transportas, sveikata, paskolos, draudimas. Kitos skaičiuojamos kaip norai.</p>`;
    },
    ask: "Pagal mano paskutinių mėnesių duomenis pritaikyk man 50/30/20 taisyklę ir pasiūlyk biudžetų ribas."},
  {id: "zero", t: "Nulinis biudžetas", short: "Kiekvienas euras gauna užduotį", col: "c7", ic: "list",
    intro: "Mėnesio pradžioje paskirstai visas pajamas iki paskutinio euro: išlaidoms, taupymui, investicijoms ar skoloms. Pajamos minus paskirstyta suma turi būti lygi nuliui. Tai nereiškia, kad viską išleidi, taupymas irgi yra paskirtis.",
    how: ["Užsirašyk tikėtinas mėnesio pajamas.",
      "Surašyk visas fiksuotas išlaidas: nuomą, komunalinius, paskolas, prenumeratas.",
      "Paskirstyk likutį kintamoms išlaidoms ir taupymui, kol neliks nepaskirstytų pinigų.",
      "Jei kurioje kategorijoje viršiji, perkelk sumą iš kitos, o ne iš taupymo."],
    app: ["Pasikartojančiose operacijose pažymėk visus fiksuotus mokėjimus, kad jie būtų įskaičiuoti planuojant.",
      "Biudžetuose nustatyk ribas likusioms kategorijoms.",
      "Apžvalgos kortelė rodo, kiek dar nepaskirstyta. Tikslas, kad nepaskirstyta suma būtų nulis arba nukeliautų į taupymą."],
    pros: "Visiška kontrolė, labai greitai matosi, kur nuteka pinigai.",
    cons: "Reikia daugiau laiko kas mėnesį, ypač pradžioje.",
    ask: "Padėk man sudaryti nulinį biudžetą kitam mėnesiui pagal mano pajamas ir išlaidas."},
  {id: "envelope", t: "Vokų metodas", short: "Atskiras „vokas“ kiekvienai išlaidų sričiai", col: "c4", ic: "gift",
    intro: "Kiekvienai kintamų išlaidų sričiai (maistui, kavinėms, pramogoms) skiri fiksuotą sumą, tarsi vokelį su grynaisiais. Kai vokelis tuščias, toje srityje iki mėnesio pabaigos nebeišleidi.",
    how: ["Pasirink 3–5 kategorijas, kuriose dažniausiai viršiji.",
      "Kiekvienai nustatyk mėnesio sumą.",
      "Prieš pirkdamas pažiūrėk, kiek liko tame voke.",
      "Jei viename voke lieka pinigų, mėnesio pabaigoje juos atsidėk taupymui."],
    app: ["Biudžetai veikia kaip vokai: kiekviena kategorija turi savo ribą.",
      "Apžvalgoje prie kiekvienos kategorijos matai, kiek dar liko.",
      "Įjunk pranešimus, kad programėlė įspėtų, kai išleidi 85 % ribos ir kai ją viršiji."],
    pros: "Labai aiškios ribos, sunku netyčia išleisti per daug.",
    cons: "Netinka fiksuotoms išlaidoms. Reikia disciplinos nepersikelti pinigų iš voko į voką.",
    ask: "Kurioms mano kategorijoms verta nustatyti vokų ribas ir kokio dydžio?"},
  {id: "payfirst", t: "Pirma sumokėk sau", short: "Taupymas pirmas, ne paskutinis", col: "c3", ic: "coin",
    intro: "Vos gavęs atlyginimą, iškart atidėk sutartą dalį taupymui ar investavimui, o gyveni iš to, kas lieka. Ši idėja ypač išpopuliarėjo po George S. Clason knygos „The Richest Man in Babylon“, kurioje siūloma atsidėti bent dešimtadalį pajamų.",
    how: ["Nuspręsk procentą: pradžiai 10 %, vėliau 15–20 %.",
      "Banke susikurk automatinį pervedimą atlyginimo dieną į taupomąją sąskaitą ar investavimo platformą.",
      "Kas pusmetį padidink procentą bent 1 punktu, ypač gavęs atlyginimo padidinimą."],
    app: ["Sąskaitose sukurk taupomąją ar investavimo sąskaitą. Pervedimai į ją bus laikomi pervedimais, o ne išlaidomis.",
      "Sukurk taupymo tikslą ir stebėk progresą.",
      "Turto skiltyje matysi, kaip auga tavo grynoji vertė."],
    pros: "Taupymas vyksta automatiškai, nereikia valios kiekvieną mėnesį.",
    cons: "Jei atidėsi per daug, mėnesio pabaigoje gali pritrūkti. Pradėk nuo mažesnio procento.",
    calc() {
      const st = helpStats(); if (!st || st.inc <= 0) return noData();
      return calcRows([["10 % pajamų", eur0(st.inc * .1) + " / mėn."], ["15 % pajamų", eur0(st.inc * .15) + " / mėn."], ["20 % pajamų", eur0(st.inc * .2) + " / mėn."], ["20 % per metus", eur0(st.inc * .2 * 12)]]);
    },
    ask: "Kiek realiai galiu atsidėti kas mėnesį pagal „pirma sumokėk sau“ principą?"},
  {id: "emergency", t: "Avarinis fondas", short: "Finansinė pagalvė netikėtumams", col: "c12", ic: "shield",
    intro: "Avarinis fondas yra pinigai, atidėti netikėtoms situacijoms: darbo praradimui, ligai, automobilio gedimui. Dažniausiai rekomenduojama sukaupti 3–6 mėnesių būtinų išlaidų sumą ir laikyti ją lengvai pasiekiamą, bet atskirai nuo kasdienės sąskaitos.",
    how: ["Pirmas tikslas: 1 mėnesio išlaidos. Tai jau apsaugo nuo daugumos smulkių netikėtumų.",
      "Antras tikslas: 3 mėnesiai. Jei pajamos nepastovios ar išlaikai šeimą, siek 6 mėnesių.",
      "Laikyk taupomojoje sąskaitoje ar indėlyje, ne akcijose, nes jų vertė gali kristi tada, kai pinigų prireiks.",
      "Panaudojęs fondą, pirmiausia jį atstatyk."],
    app: ["Sukurk taupymo tikslą „Avarinis fondas“ su suma iš skaičiavimo žemiau.",
      "Sąskaitose pridėk taupomąją sąskaitą ir nurodyk jos likutį, tada ji bus įskaičiuota į turtą."],
    pros: "Ramybė ir mažiau skolų, kai kas nors nutinka.",
    cons: "Pinigai fonde beveik neuždirba, todėl nekaupk daug daugiau nei reikia.",
    calc() {
      const st = helpStats(); if (!st) return noData();
      return calcRows([["Vidutinės išlaidos per mėnesį", eur0(st.exp)], ["Iš jų būtinos", eur0(st.needs)], ["Minimalus fondas (3 mėn. būtinų)", eur0(st.needs * 3)], ["Patogus fondas (6 mėn. visų)", eur0(st.exp * 6)]]);
    },
    ask: "Kiek man reikėtų avariniam fondui ir per kiek laiko jį galiu sukaupti?"},
  {id: "kakeibo", t: "Kakeibo", short: "Japoniškas sąmoningų išlaidų metodas", col: "c5", ic: "book",
    intro: "Kakeibo yra japoniška namų ūkio apskaitos knyga, kurią 1904 m. sukūrė žurnalistė Hani Motoko. Esmė ne skaičiavimas, o sąmoningumas: kas mėnesį atsakai į keturis klausimus ir kiekvieną išlaidą apgalvoji.",
    how: ["Kiek pinigų turiu šį mėnesį?", "Kiek noriu sutaupyti?", "Kiek iš tikrųjų išleidžiu?", "Kaip galiu pagerėti?",
      "Išlaidas skirstyk į keturias grupes: būtinos, norai, kultūra (knygos, mokymai), netikėtos."],
    app: ["Mėnesio pabaigoje atsidaryk Apžvalgą ir atsakyk į klausimus pagal grafikus.",
      "Metų ataskaitoje palygink mėnesius.",
      "Paklausk AI patarėjo, kas šį mėnesį pasikeitė, palyginti su ankstesniu."],
    pros: "Keičia įpročius, o ne tik skaičius. Tinka tiems, kam griežti biudžetai nepatinka.",
    cons: "Nėra konkrečių ribų, todėl rezultatai priklauso nuo reguliarumo.",
    ask: "Atsakyk į keturis kakeibo klausimus pagal mano šio mėnesio duomenis."},
  {id: "jars", t: "Šeši stiklainiai", short: "Pajamos padalintos į 6 paskirtis", col: "c11", ic: "split",
    intro: "Metodas, kurį išpopuliarino T. Harv Eker. Pajamos dalijamos į šešis „stiklainius“: 55 % būtinoms išlaidoms, 10 % finansinei laisvei (investicijoms, kurių neliečiama), 10 % ilgalaikiam taupymui didesniems pirkiniams, 10 % mokymuisi, 10 % malonumams ir 5 % dovanoms ar labdarai.",
    how: ["Kiekvienam stiklainiui atidaryk atskirą sąskaitą arba bent taupymo tikslą.",
      "Atlyginimo dieną paskirstyk pagal procentus.",
      "Malonumų stiklainį būtina išleisti, kad metodas neatrodytų kaip bausmė."],
    app: ["Sukurk taupymo tikslus: „Finansinė laisvė“, „Didesni pirkiniai“, „Mokymasis“, „Dovanos“.",
      "Kategoriją „Pramogos ir sportas“ naudok kaip malonumų stiklainį ir nustatyk jai biudžetą."],
    pros: "Subalansuotas: yra vietos ir ateičiai, ir malonumams.",
    cons: "Daug dalių, todėl be automatinių pervedimų sunku laikytis.",
    calc() {
      const st = helpStats(); if (!st || st.inc <= 0) return noData();
      return calcRows([["Būtinos (55 %)", eur0(st.inc * .55)], ["Finansinė laisvė (10 %)", eur0(st.inc * .1)], ["Ilgalaikis taupymas (10 %)", eur0(st.inc * .1)], ["Mokymasis (10 %)", eur0(st.inc * .1)], ["Malonumai (10 %)", eur0(st.inc * .1)], ["Dovanos (5 %)", eur0(st.inc * .05)]]);
    },
    ask: "Kaip mano dabartinės išlaidos atrodo pagal šešių stiklainių metodą?"},
  {id: "debt", t: "Skolų grąžinimas", short: "Sniego gniūžtė ar lavina", col: "c8", ic: "minus",
    intro: "Turint kelias skolas, visoms mokamos minimalios įmokos, o visi papildomi pinigai skiriami vienai. Kai ji grąžinta, jos įmoka pridedama prie kitos. Skiriasi tik eiliškumas.",
    how: ["Sniego gniūžtė: pirma grąžink mažiausią skolą. Greitai matai rezultatą, todėl lengviau išlaikyti motyvaciją.",
      "Lavina: pirma grąžink skolą su didžiausiomis palūkanomis. Matematiškai sumoki mažiausiai palūkanų.",
      "Kol grąžini brangias skolas (kredito kortelės, vartojimo paskolos), naujų neimk.",
      "Prieš pradėdamas sukaupk bent mažą avarinį fondą, kad netikėtumas nepriverstų skolintis vėl."],
    app: ["Sąskaitose pridėk kiekvieną paskolą ar lizingą su likusia suma.",
      "Įmokos bus atpažįstamos iš banko išrašo, o Turto skiltyje matysi, kaip skola mažėja."],
    pros: "Aiškus planas, skolos baigiasi greičiau nei mokant tik minimalias įmokas.",
    cons: "Reikia laikinai mažinti kitas išlaidas.",
    ask: "Kokia tvarka man geriausia grąžinti savo paskolas ir kada jas baigsiu?"},
  {id: "impulse", t: "Impulsiniai pirkiniai", short: "30 dienų taisyklė ir prenumeratų auditas", col: "c2", ic: "bag",
    intro: "Didelė dalis išlaidų būna neplanuotos: akcijos, „tik šįkart“, pamirštos prenumeratos. Du paprasti įpročiai padeda jas sumažinti.",
    how: ["30 dienų taisyklė: norimą nebūtiną daiktą užsirašyk ir palauk 30 dienų (mažesniems pirkiniams užtenka 48 valandų). Jei vis dar reikia, pirk.",
      "Pirkinio kainą paversk darbo valandomis: kiek valandų turėtum dirbti, kad jį nupirktum?",
      "Kartą per ketvirtį peržiūrėk visas prenumeratas ir atšauk tas, kurių nenaudojai paskutinį mėnesį."],
    app: ["Operacijose pasirink kategoriją „Prenumeratos“ ir peržiūrėk sąrašą.",
      "Pasikartojančiose operacijose matai visus reguliarius mokėjimus vienoje vietoje.",
      "Pranešimai įspės apie neįprastai dideles išlaidas."],
    pros: "Nedideli pokyčiai, kurie per metus sutaupo nemažai.",
    cons: "Reikia įpratimo stabtelėti prieš perkant.",
    ask: "Kokias mano prenumeratas ir dažnas smulkias išlaidas verta peržiūrėti?"},
  {id: "invest", t: "Investavimo pradžia", short: "Reguliarumas, išskaidymas, ilgas laikas", col: "c6", ic: "briefcase",
    intro: "Investuoti verta tada, kai turi avarinį fondą ir neturi brangių skolų. Pradedančiajam svarbiausi trys principai: investuoti reguliariai, išskaidyti riziką ir galvoti ilgu laikotarpiu.",
    how: ["Reguliarus investavimas: kas mėnesį investuok tą pačią sumą, nepriklausomai nuo kainų. Taip nebandai atspėti geriausio momento.",
      "Išskaidymas: plataus indekso ETF (pvz. viso pasaulio akcijų) turi tūkstančius įmonių, todėl vienos įmonės nesėkmė mažai paveikia.",
      "Žiūrėk į mokesčius: platformos ir fondo metiniai mokesčiai per daug metų stipriai sumažina grąžą.",
      "Investuok tik tuos pinigus, kurių nereikės bent 5 metus. Trumpuoju laikotarpiu kainos gali smarkiai kristi."],
    app: ["Investicijų skiltyje įkelk platformos išrašą arba prijunk Trading 212 ir stebėk portfelį.",
      "Rinkos skiltyje gali pažiūrėti bet kurios akcijos, ETF ar kriptovaliutos grafiką.",
      "Turto skiltis rodo, kaip investicijos keičia tavo grynąją vertę."],
    pros: "Ilgainiui sudėtinės palūkanos dirba tavo naudai.",
    cons: "Vertė svyruoja, galima ir prarasti. Tai bendra informacija, ne investavimo patarimas.",
    ask: "Kiek pagal mano biudžetą galėčiau investuoti kas mėnesį neliesdamas avarinio fondo?"}
];

/* ---------- Kaip veikia programėlė ---------- */
const HELP_FAQ = [
  ["Kaip sekti kelias banko sąskaitas?", `<p>Kiekvieną banko sąskaitą laikyk atskira sąskaita programėlėje. Įkeliant išrašą programėlė pagal sąskaitos numerį ar banką pati parenka tinkamą sąskaitą, o jei failas iš naujos sąskaitos, pasiūlo ją sukurti vienu paspaudimu.</p>
    <p>Tada pervedimai tarp tavo sąskaitų nebus laikomi nei išlaidomis, nei pajamomis, o kiekvienos sąskaitos likutis bus teisingas. Sąskaitas tvarkyk skiltyje Daugiau → Sąskaitos ir skolos.</p>`],
  ["Kaip atsisiųsti išrašą iš banko?", () => `<p>Programėlė priima CSV, Excel (.xlsx) ir XML (ISO 20022, camt.053) išrašus. PDF netinka. Patogiausia išrašą atsisiųsti kompiuteryje.</p>
    ${BANK_GUIDES.map(b => `<p><b>${esc(b.n)}</b> · ${esc(b.f)}</p><ol>${b.steps.map(x => `<li>${esc(x)}</li>`).join("")}</ol>`).join("")}
    <p>Bankai kartais pakeičia meniu pavadinimus. Jei nerandi, ieškok „Sąskaitos išrašas“. Failą įkelk skiltyje Daugiau → Banko išrašo importas.</p>`],
  ["Kas yra „Laisvi pinigai“?", `<p>Pagrindinė Apžvalgos kortelė rodo, kiek dar gali išleisti ar atsidėti iki mėnesio pabaigos.</p><p>Skaičiuojama taip: šio mėnesio pajamos atėmus tai, kas jau išleista, mokėjimus, kurie dar laukia (nuoma, lizingas, prenumeratos), investavimą ir paskolų įmokas. Kol atlyginimas dar negautas, gali būti naudojamas visų įkeltų pilnų mėnesių pajamų vidurkis. Tai galima išjungti skiltyje Išvaizda.</p>`],
  ["Kaip įvesti operacijas?", `<p>Yra du būdai:</p><ul><li>Pliuso mygtukas apačioje: įrašai išlaidas, pajamas ar pervedimą ranka. Patogu grynųjų pinigų išlaidoms.</li><li>Banko išrašo importas (Daugiau → Banko išrašo importas): kartą per mėnesį įkeli CSV failą iš banko, ir programėlė pati sukuria visas operacijas.</li></ul><p>Tą patį išrašą įkėlus kelis kartus, operacijos nesidubliuoja.</p>`],
  ["Kaip programėlė parenka kategorijas?", `<p>Pagal parduotuvės ar gavėjo pavadinimą, pvz. „Maxima“ yra maistas, „Bolt“ yra transportas. Jei kategorija neatpažinta, operacija patenka į „Be kategorijos“.</p><p>Kai pakeiti operacijos kategoriją, programėlė pasiūlo įsiminti taisyklę, ir kitą kartą tokia operacija bus priskirta automatiškai. Taisykles gali peržiūrėti skiltyje Kategorijos ir taisyklės.</p>`],
  ["Kam reikia pasikartojančių mokėjimų?", `<p>Pasikartojantys mokėjimai yra tai, ką moki kas mėnesį: nuoma, lizingas, telefonas, prenumeratos. Jie naudojami planuojant, kad „Laisvi pinigai“ jau atimtų dar nesumokėtas sąskaitas.</p><p>Po kiekvieno banko išrašo importo programėlė parodo rastus reguliarius mokėjimus. Pažymėk tuos, kurie tęsis, ir atžymėk baigtus (pvz. sumokėtą lizingą).</p><p>Grynųjų pinigų mokėjimams gali įjungti automatinį operacijos sukūrimą, nes jų banko išraše nebus.</p>`],
  ["Kaip veikia biudžetai ir pranešimai?", `<p>Biudžetas yra mėnesio riba kategorijai. Apžvalgoje matai, kiek iš jos liko. Pasiekus 85 % ribos ir ją viršijus, varpelyje viršuje atsiranda įspėjimas.</p><p>Įjungus telefono pranešimus (Daugiau → Profilis), įspėjimai ateina ir kaip pranešimai.</p>`],
  ["Sąskaitos, pervedimai ir skolos", `<p>Gali turėti kelias sąskaitas: banko, grynųjų, taupomąją, investavimo. Pervedimas tarp savo sąskaitų nėra nei išlaida, nei pajama, todėl nesugadina statistikos.</p><p>Paskolas ir lizingą pridėk kaip skolas. Įmokos sumažina skolos likutį, o Turto skiltis rodo grynąją vertę (turtas minus skolos).</p>`],
  ["Investicijos ir rinka", `<p>Mano portfelis rodo turimas pozicijas, vidutinę pirkimo kainą, pelną ir dividendus. Duomenis gali įkelti iš bet kurios platformos CSV išrašo arba prijungti Trading 212.</p><p>Rinkos skiltyje surasi bet kurią akciją, ETF, indeksą ar kriptovaliutą ir pamatysi jos kainos grafiką. Mėgstamas gali pridėti prie stebimų.</p>`],
  ["AI patarėjas", `<p>Pokalbyje gali klausti apie savo finansus, pvz. „kodėl šį mėnesį išleidau daugiau?“ arba „kiek galiu sutaupyti iki vasaros?“.</p><p>Patarėjas gali ir pakeisti nustatymus: „nustatyk kavinėms 80 € ribą“, „sukurk tikslą atostogoms 1200 €“. Prieš pritaikydamas jis parodo pakeitimus, o pritaikytus gali atšaukti.</p>`],
  ["Navigacija ir perbraukimas", `<ul><li>Perbrauk turinį į kairę ar dešinę, kad pereitum į gretimą skiltį.</li><li>Atidarytame puslapyje perbraukimas į dešinę grąžina atgal.</li><li>Perbrauk per mėnesio juostą viršuje, kad pakeistum mėnesį.</li><li>Bet kurią operaciją, kategoriją, sąskaitą ar tikslą paspaudęs gali pakeisti.</li></ul>`],
  ["Keli telefonai", `<p>Atsidaryk programėlę kitame telefone ir prisijunk ta pačia paskyra. Visi duomenys bus tie patys, o pakeitimai matomi abiejuose įrenginiuose.</p>`],
  ["Išvaizdos keitimas", `<p>Daugiau → Išvaizda: tamsi ar šviesi tema, fono ir akcento spalva, teksto dydis, Apžvalgos kortelių tvarka ir „Daugiau“ meniu išdėstymas.</p>`]
];
const GLOSSARY = [
  ["Grynoji vertė", "Viso turto (pinigų sąskaitose, investicijų, kito turto) suma atėmus visas skolas."],
  ["Taupymo norma", "Kokią pajamų dalį sutaupai: (pajamos − išlaidos) ÷ pajamos."],
  ["Pervedimas", "Pinigų perkėlimas tarp tavo pačių sąskaitų. Neskaičiuojamas nei kaip išlaida, nei kaip pajama."],
  ["Pasikartojantis mokėjimas", "Reguliari išlaida ar pajama, kuri kartojasi kas mėnesį, pvz. nuoma ar atlyginimas."],
  ["Biudžeto riba", "Suma, kurios neplanuoji viršyti kategorijoje per mėnesį."],
  ["Avarinis fondas", "Atidėti pinigai netikėtoms situacijoms, dažniausiai 3–6 mėnesių išlaidų dydžio."],
  ["Infliacija", "Kainų augimas. Dėl jos ta pati suma po kelerių metų nuperka mažiau."],
  ["Sudėtinės palūkanos", "Kai uždarbis vėl uždirba. Kuo ilgiau laikai, tuo greičiau auga suma."],
  ["Metinė palūkanų norma (MPN)", "Paskolos kaina per metus procentais, įskaitant palūkanas ir privalomus mokesčius."],
  ["ETF", "Biržoje prekiaujamas fondas, kuris dažniausiai seka indeksą ir turi daug įmonių vienu metu."],
  ["Indeksas", "Įmonių grupės kainų rodiklis, pvz. S&P 500 apima 500 didelių JAV įmonių."],
  ["Diversifikacija", "Rizikos išskaidymas tarp daugelio investicijų, kad vienos nesėkmė mažai paveiktų visumą."],
  ["Vidutinė pirkimo kaina", "Kiek vidutiniškai mokėjai už vieną vienetą, kai pirkai keliais kartais skirtingomis kainomis."],
  ["Nerealizuotas pelnas", "Pelnas ar nuostolis popieriuje: kiek uždirbtum, jei parduotum dabar."],
  ["Realizuotas pelnas", "Pelnas ar nuostolis, kurį jau užfiksavai pardavęs."],
  ["Dividendai", "Įmonės pelno dalis, išmokama akcininkams."]
];

/* ---------- Vaizdai ---------- */
function vHelp() {
  return `${subHead("Pagalba")}
  <div class="tour-card"><span class="tc-ic">${icon("sparkle", 20)}</span>
    <span class="tc-t"><b>Mokomasis turas</b><small>Per minutę parodo, kur kas yra ir ką spausti.</small></span>
    <button class="btn small" id="runTour">Pradėti</button></div>
  <div class="sec-h" style="margin-top:6px"><h2>Kaip veikia programėlė</h2></div>
  <div class="faq">${HELP_FAQ.map(([q, a]) => `<details><summary>${esc(q)}</summary><div class="fa">${typeof a === "function" ? a() : a}</div></details>`).join("")}</div>
  <div class="sec-h" style="margin-top:6px"><h2>Sąvokų žodynėlis</h2></div>
  <div class="faq gloss">${GLOSSARY.map(([k, v]) => `<div><b>${esc(k)}</b><span>${esc(v)}</span></div>`).join("")}</div>
  <button class="tour-card" data-sub="lessons"><span class="tc-ic">${icon("book", 20)}</span><span class="tc-t"><b>Pamokos</b><small>Biudžeto metodai ir kaip juos pritaikyti</small></span><span class="chev">›</span></button>`;
}
function vLessons() {
  const l = S.help.lesson && LESSONS.find(x => x.id === S.help.lesson);
  if (l) return vLesson(l);
  return `${subHead("Pamokos")}
  <div class="fine" style="margin-top:-4px">Trumpos pamokos apie populiariausius biudžeto metodus: kas tai, kaip taikyti, ir kaip tai padaryti Kišenėje su tavo skaičiais.</div>
  <div class="lessons">${LESSONS.map(x => `<button class="lesson" data-lesson="${x.id}"><span class="l-ic" style="background:var(--${x.col})">${icon(x.ic, 18)}</span><b>${esc(x.t)}</b><small>${esc(x.short)}</small></button>`).join("")}</div>`;
}
function vLesson(l) {
  const i = LESSONS.indexOf(l), prev = LESSONS[i - 1], next = LESSONS[i + 1];
  const ordered = l.id === "kakeibo";
  return `<div class="subhead"><button class="linkbtn" data-lesson="">‹ Pamokos</button></div>
  <div class="lesson-page">
    <div class="lesson-hero" style="background:var(--${l.col})"><small style="opacity:.85">Pamoka ${i + 1} iš ${LESSONS.length}</small><h2>${esc(l.t)}</h2><p>${esc(l.short)}</p></div>
    <div class="lesson-sec"><h3>Kas tai</h3><p>${esc(l.intro)}</p></div>
    <div class="lesson-sec"><h3>${ordered ? "Klausimai ir grupės" : "Kaip taikyti"}</h3><ol>${l.how.map(x => `<li>${esc(x)}</li>`).join("")}</ol></div>
    ${l.calc ? `<div class="lesson-sec"><h3>Tavo skaičiai</h3>${l.calc()}</div>` : ""}
    <div class="lesson-sec"><h3>Kaip tai padaryti Kišenėje</h3><ul>${l.app.map(x => `<li>${esc(x)}</li>`).join("")}</ul></div>
    <div class="lesson-sec"><h3>Privalumai ir trūkumai</h3><p><b>+</b> ${esc(l.pros)}</p><p><b>−</b> ${esc(l.cons)}</p></div>
    <button class="btn" data-lessonask="${l.id}">${icon("sparkle", 16)} Klausti AI, kaip pritaikyti man</button>
    <div class="lesson-nav">${prev ? `<button class="btn ghost small" data-lesson="${prev.id}">‹ ${esc(prev.t)}</button>` : "<span></span>"}${next ? `<button class="btn ghost small" data-lesson="${next.id}">${esc(next.t)} ›</button>` : ""}</div>
  </div>`;
}
document.addEventListener("click", e => {
  const t = e.target.closest("[data-lesson],[data-lessonask]"); if (!t) return;
  e.stopPropagation();
  if (t.dataset.lessonask) {
    const l = LESSONS.find(x => x.id === t.dataset.lessonask); if (!l) return;
    S.tab = "more"; S.sub = "ai"; render(); window.scrollTo(0, 0); sendChat(l.ask); return;
  }
  S.help.lesson = t.dataset.lesson || null; render(); window.scrollTo(0, 0);
}, true);
