# Kišenė: paleidimo instrukcija

Kišenė yra asmeninių finansų programėlė (PWA), kuri veikia telefone kaip atskira aplikacija ir sinchronizuoja duomenis tarp visų tavo įrenginių.

## Kaip viskas sujungta

| Dalis | Kur veikia | Kaina |
|---|---|---|
| Programėlė (HTML, JS, ikonos) | GitHub Pages | nemokamai |
| Prisijungimas ir duomenų bazė | Supabase | nemokamas planas |
| AI patarėjo ir kainų serverio funkcijos | Supabase Edge Functions | nemokamas planas |
| Akcijų, ETF, kriptovaliutų kainos ir kursai | Yahoo Finance (per serverio funkciją) | nemokamai |
| AI modelis | Anthropic API | mokama pagal naudojimą |

Telefonas kalbasi su Supabase tiesiogiai. Kiekvienas pakeitimas pirma išsaugomas telefone, tada išsiunčiamas į duomenų bazę, o kiti prisijungę įrenginiai jį gauna per kelias sekundes. Be interneto programėlė veikia toliau, o pakeitimai išsiunčiami atsiradus ryšiui.

Anthropic API raktas laikomas tik Supabase serveryje, programėlėje jo nėra.

Paleidimas užtrunka apie 30–40 minučių. Svetainių meniu pavadinimai laikui bėgant gali šiek tiek keistis, todėl jei kažko nerandi tiksliai taip, ieškok artimiausio atitikmens.

---

## 1. Supabase projektas ir duomenų bazė

1. Užsiregistruok [supabase.com](https://supabase.com) ir spausk **New project**.
2. Įrašyk pavadinimą (pvz. `kisene`), sugeneruok duomenų bazės slaptažodį ir išsisaugok jį. Regioną rinkis Europoje, pvz. **Central EU (Frankfurt)**.
3. Kai projektas paruoštas, atidaryk **SQL Editor** → **New query**.
4. Įklijuok visą failo `supabase/schema.sql` turinį ir spausk **Run**. Turi pamatyti „Success“.

Tai sukuria lenteles `transactions`, `inv_tx` ir `settings`, įjungia apsaugą (kiekvienas vartotojas mato tik savo duomenis) ir realaus laiko sinchronizaciją.

## 2. Raktai į `config.js`

1. Supabase atidaryk **Project Settings** → **API Keys** (arba **Data API**).
2. Nusikopijuok **Project URL** (atrodo kaip `https://abcdxyz.supabase.co`).
3. Nusikopijuok viešą raktą: **anon public** arba **publishable** (prasideda `eyJ…` arba `sb_publishable_…`).
4. Atidaryk failą `config.js` ir įrašyk abi reikšmes:

```js
window.KISENE_CONFIG = {
  SUPABASE_URL: "https://abcdxyz.supabase.co",
  SUPABASE_ANON_KEY: "sb_publishable_..."
};
```

Šis raktas yra skirtas naršyklei ir gali būti viešas. **Niekada** nedėk čia `service_role` / `secret` rakto.

## 3. Programėlės talpinimas GitHub Pages

1. Užsiregistruok [github.com](https://github.com) ir sukurk naują repozitoriją, pvz. `kisene`. Pasirink **Public** (GitHub Pages nemokamai veikia su viešomis repozitorijomis). Joje nėra jokių slaptų duomenų.
2. Repozitorijoje spausk **Add file** → **Upload files** ir nutempk visus failus iš pagrindinio projekto aplanko (`index.html`, visus `.js`, `.png`, `styles.css`, `manifest.webmanifest`). Aplanko `supabase` įkelti nereikia, jo failai skirti Supabase. Spausk **Commit changes**.
3. Atidaryk **Settings** → **Pages**. Prie **Source** pasirink **Deploy from a branch**, šaką `main`, aplanką `/ (root)` ir spausk **Save**.
4. Po 1–2 minučių programėlė bus pasiekiama adresu `https://TAVO-VARDAS.github.io/kisene/`. Išsisaugok šį adresą.

## 4. Prisijungimo nustatymai Supabase

1. Supabase atidaryk **Authentication** → **URL Configuration**.
2. **Site URL** įrašyk savo GitHub Pages adresą, pvz. `https://TAVO-VARDAS.github.io/kisene/`.
3. Į **Redirect URLs** pridėk tą patį adresą. Tada patvirtinimo ir slaptažodžio atkūrimo laiškų nuorodos ves į tavo programėlę.
4. **Authentication** → **Sign In / Providers** patikrink, kad **Email** būdas įjungtas. **Confirm email** rekomenduoju palikti įjungtą.

Dabar atidaryk programėlės adresą, pasirink **Nauja paskyra**, užsiregistruok ir patvirtink el. paštą. Po to prisijunk.

## 5. Užrakink naujų paskyrų kūrimą

Kai tavo paskyra sukurta, uždrausk kitiems registruotis, kad niekas kitas negalėtų naudotis tavo duomenų baze ir AI:

**Authentication** → **Sign In / Providers** (arba **Settings**) → išjunk **Allow new users to sign up**.

Jei nori, kad programėle naudotųsi ir šeimos narys, pirma leisk jam užsiregistruoti, tada išjunk. Kiekvienas matys tik savo duomenis.

## 6. Serverio funkcijos

Reikia funkcijų `market-data` (kainos ir grafikai) ir `ai-advisor` (AI patarėjas), o `broker-sync` (Trading 212) nebūtina. Visos diegiamos vienodai.

### 6.0 Kainų funkcija `market-data`

1. **Edge Functions** → **Deploy a new function** → **Via Editor**.
2. Pavadinimas tiksliai `market-data`.
3. Įklijuok failo `supabase/functions/market-data/index.ts` turinį.
4. Išjunk **Verify JWT** jungiklį, jei jis yra (funkcija pati tikrina vartotoją).
5. Spausk **Deploy function**. Paslapčių šiai funkcijai nereikia.

Kainos imamos iš Yahoo Finance viešų adresų. Tai neoficialus šaltinis, todėl jei kada nors nustotų veikti, programėlėje kiekvienai pozicijai gali įvesti kainą ranka.

### 6.1 Platformų prijungimo funkcija `broker-sync`

Ją reikia tik tada, jei nori prijungti Trading 212.

1. **Edge Functions** → **Deploy a new function** → **Via Editor**, pavadinimas tiksliai `broker-sync`.
2. Įklijuok failo `supabase/functions/broker-sync/index.ts` turinį, išjunk **Verify JWT** ir spausk **Deploy**.
3. **Secrets** pridėk `BROKER_SECRET`: bet koks ilgas atsitiktinis tekstas (pvz. 40 raidžių ir skaičių). Juo šifruojami tavo Trading 212 raktai. Vėliau jo nekeisk, nes tada išsaugotų raktų nebebus galima iššifruoti ir platformą reikės prijungti iš naujo.

### AI patarėjas `ai-advisor`

### 6.2 Anthropic API raktas

1. Užsiregistruok [console.anthropic.com](https://console.anthropic.com).
2. **Billing** skiltyje papildyk sąskaitą nedidele suma ir nustatyk mėnesio išlaidų limitą, kad netikėtai neišleistum daugiau.
3. **API Keys** → **Create Key**. Nusikopijuok raktą (prasideda `sk-ant-…`). Jis rodomas tik vieną kartą.

### 6.3 Serverio funkcija

1. Supabase atidaryk **Edge Functions** → **Deploy a new function** → **Via Editor**.
2. Funkcijos pavadinimas turi būti tiksliai `ai-advisor`.
3. Ištrink pavyzdinį kodą ir įklijuok visą failo `supabase/functions/ai-advisor/index.ts` turinį.
4. Jei matai jungiklį **Verify JWT** (arba **Enforce JWT verification**), išjunk jį. Funkcija pati tikrina, ar vartotojas prisijungęs, o platformos tikrinimas su naujais raktais kartais atmeta teisingas užklausas.
5. Spausk **Deploy function**.

### 6.4 Paslaptys

**Edge Functions** → **Secrets** (arba **Manage secrets**) pridėk:

| Pavadinimas | Reikšmė | Būtina |
|---|---|---|
| `ANTHROPIC_API_KEY` | tavo `sk-ant-…` raktas | taip |
| `ALLOWED_EMAILS` | tavo el. paštas (keli atskiriami kableliu) | rekomenduojama |
| `ANTHROPIC_MODEL` | pvz. `claude-sonnet-5-5` | ne, numatytasis `claude-haiku-4-5-20251001` |

Numatytasis modelis Haiku yra pigiausias ir mėnesio analizei pakankamas. Jei nori išsamesnių patarimų, nurodyk Sonnet. Kainas pasitikrink [Anthropic kainų puslapyje](https://www.anthropic.com/pricing). Viena mėnesio analizė sunaudoja kelis tūkstančius tokenų.

Programėlėje atidaryk **AI patarėjas** → **Analizuoti mėnesį** ir patikrink, ar veikia.

## 7. Įdiegimas telefonuose

Kiekviename įrenginyje atidaryk `https://TAVO-VARDAS.github.io/kisene/` ir prisijunk ta pačia paskyra.

- **iPhone / iPad:** būtinai per **Safari**. Spausk **Bendrinti** (kvadratas su rodykle aukštyn) → **Į pradžios ekraną** → **Pridėti**.
- **Android:** per **Chrome**. Spausk **⋮** → **Įdiegti programą** (arba programėlės nustatymuose spausk **Įdiegti**).
- **Kompiuteris:** Chrome ar Edge adreso juostoje spausk įdiegimo ikoną.

Programėlė atsidarys su savo ikona, be naršyklės juostų, ir veiks be interneto.

---

## Kaip naudotis

### Sąskaitos

Daugiau → Sąskaitos: pridėk visas savo sąskaitas (pvz. Revolut, Trading 212 kaip „Investavimo platforma“). Lauke „Atpažinti pervedimus pagal žodžius“ įrašyk, kaip ta sąskaita rodoma banko išraše (pvz. `revolut`, `trading 212`). Tada importuojant pervedimai į ją bus pažymėti kaip pervedimai, o ne išlaidos. Pervedimai į investavimo platformą apžvalgoje rodomi kaip investavimas.

### Tavo vardas

Daugiau → Paskyra ir programėlė: įrašyk vardą ir pavardę, kaip jie rodomi išraše. Pervedimai sau į kitus bankus bus atpažinti automatiškai.

### Banko importas

Daugiau → Banko išrašo importas. Pasirink, kurios sąskaitos tai išrašas, ir įkelk CSV. Peržiūroje gali pakeisti bet kurios operacijos kategoriją, o pakeitimai išsaugomi kaip taisyklės kitam kartui. Swedbank išraše esantis pabaigos likutis gali būti nustatytas kaip sąskaitos likutis. Tą patį failą įkėlus dar kartą, dublikatų nebus. Jei pervedimas į Revolut jau įrašytas iš Swedbank išrašo, Revolut išraše jis bus praleistas.

### Investicijos

Investicijos → Importuoti CSV. Trading 212: Istorija → Eksportuoti (CSV). Revolut: investavimo skiltyje atsisiųsk operacijų ataskaitą CSV formatu. Kitų platformų failams stulpelius priskiri pats. Kainos simboliai randami automatiškai pagal ISIN ar tikerį, o neteisingą gali pataisyti atidaręs poziciją. Pozicijos skaičiuojamos vidutinės kainos metodu, sumos kitomis valiutomis perskaičiuojamos į eurus operacijos dienos kursu.

### Pradžios vedlys

Pirmą kartą prisijungus be duomenų, programėlė paprašo vardo, sąskaitų ir jų likučių, pasiūlo įkelti išrašą ir pagal jį pasiūlo biudžetus. Vedlį gali paleisti iš naujo skiltyje Paskyra ir programėlė.

### Skolos

Daugiau → Sąskaitos → Pridėti paskolą: įrašyk likusią skolą ir įmokų gavėją, kaip jis rodomas išraše (pvz. `artea lizingas`). Įmokos bus laikomos skolos grąžinimu, o ne išlaidomis, mažins likusią skolą ir bus atimtos iš grynosios vertės. Ankstesnes įmokas programėlė pasiūlo perklasifikuoti. Visa įmoka laikoma skolos grąžinimu, palūkanų dalis atskirai neišskiriama.

### Turtas ir metų ataskaita

Apžvalgos turto kortelė atidaro grynosios vertės grafiką ir pokyčio išskaidymą. Daugiau → Metų ataskaita rodo metus pagal mėnesius ir kategorijas, palyginimą su praėjusiais metais ir investicijų pajamas (pardavimų pelną, dividendus, palūkanas). Ataskaitą galima eksportuoti CSV.

### Pranešimai

Varpelis viršuje rodo įspėjimus: biudžeto ribas, neįprastai dideles išlaidas, artėjančius pasikartojančius mokėjimus, mėnesio suvestinę. Paskyra ir programėlė → Pranešimai įjungia ir telefono pranešimus. Jie tikrinami, kai programėlė atidaroma ar sinchronizuojasi, todėl visiškai uždarytos programėlės pranešimai nepasieks. iPhone pranešimai veikia tik įdiegtoje programėlėje.

### Rinka ir grafikai

Investicijos → Rinka: ieškok bet kurios akcijos, ETF, kriptovaliutos, indekso ar žaliavos ir atidaryk grafiką (nuo 1 dienos iki viso laikotarpio). Žvaigždute pridėsi prie stebimų. Iš savo pozicijos lango atsidaro tos pozicijos grafikas.

### Trading 212 prijungimas

Investicijos → Prijungti Trading 212. Trading 212 programėlėje: Nustatymai → API (Beta) → sukurk raktą tik su skaitymo leidimais (account, portfolio, history) ir įklijuok API raktą bei slaptą raktą. Programėlė pati parsiunčia pirkimus, pardavimus, dividendus, įnešimus ir palūkanas, o vėliau atnaujina kas 6 valandas, kai atidarai investicijas. Jei anksčiau importavai tą pačią istoriją iš CSV, dublikatai praleidžiami. Veikia tik Invest ir Stocks ISA sąskaitos. Revolut viešo API investicijoms neturi, todėl jo operacijas importuok CSV.

### AI pokalbis

Daugiau → AI patarėjas: rašyk bet kokį klausimą apie savo finansus arba prašyk pakeitimų, pvz. „nustatyk kavinėms 100 € biudžetą“, „Globaltips priskirk apsipirkimui“, „sukurk tikslą atostogoms 1500 € iki birželio“. Pakeitimai pritaikomi iš karto ir po atsakymu rodomi su mygtuku „Atšaukti šiuos pakeitimus“. Jei nori, kad AI pirmiausia paklaustų, pirmame pokalbio lange nuimk varnelę „Pakeitimus taikyti iš karto“.

### Viską galima keisti

Paspaudus kategoriją, taisyklę, tikslą, pasikartojančią operaciją, sąskaitą ar operaciją, atsidaro jos redagavimo langas. Naują kategoriją sukursi ir tiesiai iš operacijos įvedimo lango („+ Nauja“). Daugiau → Išvaizda: tema, fono ir akcento spalvos, teksto dydis, „Daugiau“ meniu išdėstymas, apžvalgos skilčių tvarka ir laisvų pinigų skaičiavimo būdas.

### Pasikartojančios operacijos

Jei kas mėnesį įkeli banko išrašą, nieko vesti ranka nereikia. Po kiekvieno importo atsidaro langas „Pasikartojantys mokėjimai“: programėlė parodo mokėjimus, kurie kartojasi kas mėnesį (nuoma, komunaliniai, prenumeratos, lizingas, atlyginimas), ir tu pažymi, kuriuos sekti. Baigtus (pvz. išmokėtą lizingą) atžymi, ir jie nebeskaičiuojami. Pažymėti mokėjimai naudojami kortelėje „Laisvi pinigai“ kaip laukiami, kol atsiras kitame išraše.

Grynųjų ir kitų sąskaitų, kurių išrašų neįkeli, mokėjimams pasirink „Sukurti operaciją automatiškai“. Jei automatiškai sukurta operacija vėliau atsiranda ir banko išraše, programėlė ją pakeičia banko įrašu, kad nebūtų dublikato.

### Kategorijos ir taisyklės

Daugiau → Kategorijos ir taisyklės: kurk savo kategorijas, keisk spalvas, slėpk nereikalingas. Kai pakeiti operacijos kategoriją, programėlė pasiūlo tai įsiminti.

## Atnaujinimas iš ankstesnės versijos

Paleisk naujausią `supabase/schema.sql` (prideda platformų prijungimo lentelę), atnaujink `ai-advisor` ir `market-data` funkcijų kodą, jei nori Trading 212, įdiek `broker-sync` (6.1) ir įkelk visus failus į GitHub.

## Atnaujinimas iš 1 versijos

Jei jau buvai paleidęs ankstesnę versiją: SQL Editor paleisk naują `supabase/schema.sql` (jis nieko neištrina), įdiek `market-data` funkciją, atnaujink `ai-advisor` funkcijos kodą ir įkelk į GitHub visus failus. Senas `app.js` failas nebereikalingas, jį gali ištrinti.

## Atnaujinimai

Pakeitus bet kurį failą:

1. Faile `sw.js` padidink versiją, pvz. `kisene-v7` → `kisene-v8`.
2. Įkelk pakeistus failus į GitHub (**Add file** → **Upload files**, tie patys pavadinimai perrašomi).
3. Telefonuose naujoji versija atsiras po vieno ar dviejų programėlės atidarymų.

## Atsarginės kopijos

**Daugiau** → **Paskyra ir programėlė** → **Eksportuoti** atsisiunčia biudžeto ir investicijų operacijas. Supabase nemokamame plane automatinių duomenų bazės kopijų nėra, todėl kartą per mėnesį pasidaryk CSV kopiją.

## Svarbu apie nemokamą Supabase planą

Nemokami Supabase projektai sustabdomi, jei kurį laiką (šiuo metu apie savaitę) nėra jokios veiklos. Jei programėlę naudoji kasdien, tai tavęs nepalies. Jei projektas sustabdytas, jį atkursi Supabase valdymo skydelyje vienu mygtuku, duomenys neprarandami. Dabartines sąlygas pasitikrink [supabase.com/pricing](https://supabase.com/pricing).

## Trikčių šalinimas

| Ką matai | Ką daryti |
|---|---|
| „Programėlė dar nesujungta su duomenų baze“ | Užpildyk `config.js` (2 žingsnis) ir įkelk iš naujo į GitHub. |
| „Neteisingas el. paštas arba slaptažodis“ | Patikrink duomenis arba spausk **Pamiršau slaptažodį**. |
| „Pirma patvirtink el. paštą“ | Rask laišką nuo Supabase (patikrink ir šlamšto aplanką). |
| Patvirtinimo nuoroda veda į `localhost` | Pataisyk **Site URL** ir **Redirect URLs** (4 žingsnis). |
| Viršuje „Nepavyko išsiųsti · laukia N“ | Patikrink, ar paleistas `schema.sql`. Pakeitimai neprarasti, jie bus išsiųsti vėliau. |
| „Duomenų bazė pasenusi“ | Paleisk naujausią `schema.sql` (žr. „Atnaujinimas iš 1 versijos“). |
| „Serverio funkcija „market-data“ dar neįdiegta“ | Įdiek kainų funkciją (6.0). |
| Trading 212: „atmetė raktą“ arba „trūksta leidimų“ | Sukurk naują raktą su visais skaitymo leidimais ir prijunk iš naujo. |
| Pozicijų kiekiai nesutampa su Trading 212 | Investicijos → ⋯ → Sinchronizuoti viską iš naujo. |
| Pozicijos kaina nežinoma arba neteisinga | Atidaryk poziciją ir įrašyk Yahoo simbolį (pvz. `VWCE.DE`) arba kainą ranka. |
| Kitas įrenginys nemato pakeitimų | Uždaryk ir vėl atidaryk programėlę. Patikrink, ar abiejuose prisijungta ta pačia paskyra. |
| „AI funkcija dar neįdiegta“ | Funkcijos pavadinimas turi būti tiksliai `ai-advisor` (6.3). |
| „Serveryje nenustatytas ANTHROPIC_API_KEY“ | Pridėk paslaptį (6.4). |
| „Netinkamas Anthropic API raktas“ | Sukurk naują raktą ir atnaujink paslaptį. |
| „Šiai paskyrai AI analizė neleidžiama“ | Įrašyk savo el. paštą į `ALLOWED_EMAILS`. |
| Klaida 401 naudojant AI | Išjunk funkcijos JWT jungiklį (6.3, 4 punktas). |

Išsamesnes klaidas rasi Supabase: **Edge Functions** → `ai-advisor` → **Logs**.

## Failų sąrašas

```
index.html, styles.css, manifest.webmanifest, sw.js   programėlės puslapis, išvaizda, įdiegimas, darbas be interneto
config.js                          tavo Supabase adresas ir viešas raktas
supabase.js                        Supabase biblioteka (v2.117.2)
util.js, data.js, main.js          bendros funkcijos, duomenys ir sinchronizacija, paleidimas
budget.js, edit.js, recurring.js   biudžetas, redagavimas, pasikartojantys mokėjimai
importer.js                        banko ir investicijų CSV importas
invest.js, market.js, wealth.js    investicijos, rinka ir grafikai, turtas
report.js, onboard.js, notify.js   metų ataskaita, pradžios vedlys, pranešimai
theme.js, ai.js                    išvaizda, AI patarėjas
help.js, tour.js                   pagalba ir pamokos, mokomasis turas
*.png                              ikonos
supabase/                          tik Supabase: schema.sql ir serverio funkcijos (į GitHub kelti nebūtina)
```
