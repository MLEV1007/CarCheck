import type { Metadata } from 'next';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { CarPassLogo } from '@/components/branding/CarPassLogo';

export const metadata: Metadata = {
  title: 'Adatkezelési Tájékoztató | CarPass',
  description:
    'A CarPass (Mányi Levente EV.) adatkezelési tájékoztatója a GDPR és az Infotv. szerint.',
};

const EFFECTIVE_DATE = '2026. augusztus 7.';

/**
 * Adatkezelési tájékoztató (`/adatkezeles`) -- Stripe design system (stripe.md), mert
 * ez jogi/settings jellegű, publikus, bejelentkezés nélkül elérhető felület (nincs
 * middleware-védelem rajta, lásd `middleware.ts` -- csak a `/dashboard`, `/inspections`,
 * `/settings` előtagok védettek).
 *
 * **A dokumentum KÉT adatkezelési kört fed le, szándékosan élesen elválasztva (I./II.
 * rész), mert jogilag valóban két különböző szerepről van szó:**
 *   I. Mányi Levente EV. mint ADATKEZELŐ -- a CarPass-előfizető (vizsgáló cég /
 *      Menedzser / Átvizsgáló) saját fiók- és szolgáltatás-használati adatai.
 *   II. Mányi Levente EV. mint ADATFELDOLGOZÓ -- a publikus riporton (`/report/
 *       [public_token]`) esetlegesen megjelenő Megrendelői (autó vevője) adatok,
 *       amelyeknek az ADATKEZELŐJE maga az előfizető vizsgáló cég, mi csak technikai
 *       feldolgozóként tároljuk ezeket a cég megbízásából.
 *
 * A konkrét tartalom (adatkörök, jogalapok, megőrzési idő, adatfeldolgozók) a
 * ténylegesen létező adatbázis-sémára és kódra épül (lásd `SettingsForm.tsx`,
 * `20260806_inspector_and_client_fields.sql`, `20260803_organizations_rbac.sql`,
 * `app/api/account/delete/route.ts`, `.env.local.example` -- Supabase/Stripe/Gemini
 * integrációk), NEM generikus sablon-szöveg.
 */
export default function AdatkezelesPage() {
  return (
    <div className="min-h-screen bg-stripe-canvas-soft">
      <header className="border-b border-stripe-hairline bg-white">
        <div className="mx-auto flex max-w-[760px] items-center justify-between px-4 py-5 sm:px-0">
          <Link href="/" aria-label="Vissza a CarPass főoldalára">
            <CarPassLogo variant="light" size={32} withSubtitle={false} />
          </Link>
          <Link
            href="/login"
            className="font-sohne text-[14px] font-normal text-stripe-primary hover:underline"
          >
            Vissza a belépéshez
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-[760px] px-4 py-12 sm:px-0">
        <p className="font-sohne text-[13px] font-medium uppercase tracking-[0.4px] text-stripe-primary">
          Jogi dokumentum
        </p>
        <h1 className="mt-2 font-sohne text-[34px] font-light leading-[1.15] tracking-stripe-lg text-stripe-ink">
          Adatkezelési tájékoztató
        </h1>
        <p className="mt-3 font-sohne text-[15px] font-light text-stripe-ink-mute">
          Hatályos: {EFFECTIVE_DATE} &middot; Verzió: 1.0
        </p>

        <div className="mt-10 rounded-stripe-lg border border-stripe-hairline bg-white p-6 shadow-stripe-1 sm:p-10">
          <Prose>
            <P>
              A jelen tájékoztató célja, hogy átlátható, közérthető tájékoztatást adjon
              arról, hogy a CarPass szolgáltatás (a{' '}
              <Code>carpass.hu</Code> domain alatt elérhető, jelszó nélküli
              hitelesítéssel, Autóvizsgáló szakemberek részére nyújtott B2B SaaS
              alkalmazás, a továbbiakban: &bdquo;<b>Szolgáltatás</b>&rdquo;) üzemeltetése
              során milyen személyes adatokat, milyen célból, milyen jogalapon és meddig
              kezelünk, kik férhetnek hozzájuk, és milyen jogok illetik meg az
              érintetteket. A tájékoztató a természetes személyeknek a személyes adatok
              kezelése tekintetében történő védelméről és az ilyen adatok szabad
              áramlásáról szóló (EU) 2016/679 rendelet (&bdquo;<b>GDPR</b>&rdquo;), valamint
              az információs önrendelkezési jogról és az információszabadságról szóló
              2011. évi CXII. törvény (&bdquo;<b>Infotv.</b>&rdquo;) alapján készült.
            </P>
            <Callout>
              <b>Fontos, kétszintű szerkezet.</b> A Szolgáltatás jellegéből adódóan az
              üzemeltető kétféle szerepben kezel személyes adatokat: (I) a CarPast
              előfizető autóvizsgáló cégek és felhasználóik saját fiók- és
              számlázási adatainál <b>Adatkezelőként</b>, (II) a vizsgálati riportokon
              esetlegesen megjelenő, az autót vásárló/megrendelő ügyfelek adatainál
              pedig kizárólag <b>Adatfeldolgozóként</b> (technikai közreműködőként) jár
              el -- ott az Adatkezelő maga az előfizető vizsgáló cég. A két kört a
              tájékoztató I. és II. része külön tárgyalja.
            </Callout>

            <SectionTitle number="1">Az Adatkezelő adatai</SectionTitle>
            <DefinitionList
              items={[
                ['Név / cégforma', 'Mányi Levente egyéni vállalkozó (EV.)'],
                ['Székhely / levelezési cím', '1033 Budapest, Hévízi út 29.'],
                ['Adószám', '91557542-1-41'],
                ['Adatvédelmi kapcsolattartó e-mail', 'info@buildmysite.hu'],
                ['Szolgáltatás / domain', 'CarPass -- carpass.hu'],
              ]}
            />
            <P>
              Adatvédelmi kérdés, kérelem vagy panasz esetén a fenti e-mail címen
              vagyunk elérhetők. Törekszünk arra, hogy minden megkeresésre legkésőbb 25
              napon belül érdemben válaszoljunk.
            </P>

            <SectionTitle number="2">Fogalommeghatározások</SectionTitle>
            <List
              items={[
                <>
                  <b>Vizsgáló cég / Előfizető:</b> az az autóvizsgáló vállalkozás
                  (annak Menedzser és Átvizsgáló szerepkörű munkatársai), amely
                  regisztrál és előfizet a Szolgáltatásra.
                </>,
                <>
                  <b>Megrendelő:</b> a Vizsgáló cég saját ügyfele -- jellemzően az
                  átvizsgált autó tulajdonosa vagy vásárlója --, akinek a nevét,
                  telefonszámát és/vagy e-mail címét a Vizsgáló cég opcionálisan
                  rögzítheti egy vizsgálathoz.
                </>,
                <>
                  <b>Publikus riport:</b> a <Code>/report/[egyedi-token]</Code> címen,
                  bejelentkezés nélkül elérhető, a Vizsgáló cég által a Megrendelőnek
                  átadott interaktív vizsgálati jelentés.
                </>,
                <>
                  <b>Adatfeldolgozó:</b> az a szereplő, aki az Adatkezelő nevében,
                  annak utasítása alapján kezel személyes adatokat, önálló
                  döntési jogkör nélkül azok céljáról és eszközeiről (GDPR 4. cikk 8.
                  pont).
                </>,
              ]}
            />

            <SectionTitle number="3">
              I. rész -- Saját adatkezelésünk (Adatkezelőként): a Vizsgáló cégek és
              felhasználóik fiók- és szolgáltatás-adatai
            </SectionTitle>
            <P>
              Ebben a körben a Mányi Levente EV. minősül Adatkezelőnek: mi döntjük el,
              hogy a Szolgáltatás működtetéséhez milyen fiók-, számlázási és
              használati adatokat kezelünk.
            </P>

            <SubTitle>3.1. Regisztráció és bejelentkezés</SubTitle>
            <P>
              A Szolgáltatás jelszó nélküli hitelesítést használ, Supabase Auth
              (Supabase, Inc.) technológiai alapon:
            </P>
            <List
              items={[
                <>
                  <b>Belépési link e-mailben (&bdquo;Magic Link&rdquo;):</b> a
                  regisztrációhoz/belépéshez megadott e-mail címre egyszer használatos,
                  időkorlátos belépési linket küldünk. Kezelt adat: e-mail cím,
                  regisztráció időpontja.
                </>,
                <>
                  <b>Passkey (Face ID / Touch ID / biztonsági kulcs, WebAuthn
                  szabvány):</b> a beállítások oldalon regisztrálható gyorsbelépési
                  mód. <b>Az ujjlenyomat-/arcfelismerési biometrikus adat SOHA nem
                  hagyja el az Ön eszközét</b> -- a szerverünkhöz kizárólag egy
                  nyilvános kulcs és egy véletlenszerű azonosító (credential ID) kerül,
                  amelyekből a biometrikus mintázat nem állítható vissza. Ez nem
                  minősül a GDPR szerinti biometrikus (különleges kategóriájú)
                  adatnak, mivel nem alkalmas a személy egyedi azonosítására a
                  szerveroldalon.
                </>,
              ]}
            />
            <P>
              <b>Jogalap:</b> a Szolgáltatás igénybevételére irányuló szerződés
              teljesítése (GDPR 6. cikk (1) bek. b) pont).
            </P>

            <SubTitle>3.2. Fiók- és cégprofil adatok</SubTitle>
            <P>
              A Beállítások oldalon a Vizsgáló cég megadhatja (mindegyik opcionális,
              kivéve az e-mail címet, amely a regisztrációból ered): cégnév, céges
              telefonszám, céges e-mail cím, céglogó (kép), elsődleges márkaszín. Ezek
              az adatok jelennek meg a Dashboardon és a publikus riportok fejlécében,
              hogy a Megrendelő lássa, melyik cég készítette a vizsgálatot. Emellett a
              rendszer tárolja a szervezeten belüli szerepkört (Menedzser / Átvizsgáló)
              és a csapaton belüli jogosultsági beállításokat (pl. &bdquo;láthatja-e az
              Átvizsgáló a teljes cég riportjait&rdquo;).
            </P>
            <P>
              <b>Jogalap:</b> szerződés teljesítése (6. cikk (1) b)).
            </P>

            <SubTitle>3.3. Csapatkezelés (meghívás)</SubTitle>
            <P>
              Bizonyos előfizetési csomagoknál a Menedzser saját munkatársait
              e-mail-alapú meghívó linkkel csatlakoztathatja a cég szervezetéhez. A
              meghívott munkatárs e-mail címe és a hozzá tartozó fiók a fenti 3.1-3.2
              pont szerint kezelt adatokkal azonos módon kerül nyilvántartásba, a
              Menedzser cégéhez rendelve.
            </P>
            <P>
              <b>Jogalap:</b> szerződés teljesítése / az Előfizető jogos érdeke a
              saját csapata adminisztrálásában (6. cikk (1) b) és f)).
            </P>

            <SubTitle>3.4. AI-funkciók (Google Gemini API)</SubTitle>
            <P>
              A Szolgáltatás egyes lépéseinél (alvázszám/VIN beolvasása fényképről,
              szervizkönyv beolvasása, felszereltség szabadszöveges/hangalapú
              elemzése, riport-összefoglaló generálása, publikus riporton elérhető
              AI-chat, szöveg nyelvhelyességi javítása) a Vizsgáló cég kifejezett
              kezdeményezésére a rendszer a beküldött szöveget/képet a Google Gemini
              API-nak (üzemeltető: Google Ireland Limited, illetve a Google LLC
              csoport) küldi el feldolgozásra, mint <b>adatfeldolgozónak</b>. Ezek a
              funkciók autó- és vizsgálati adatokat dolgoznak fel (pl. alvázszám,
              szervizkönyv-bejegyzés fotója); amennyiben a beküldött fotó/szöveg
              véletlenül a Megrendelőre vonatkozó személyes adatot is tartalmazna, az
              a II. részben leírt adatfeldolgozói szabályok szerint kezelendő.
            </P>
            <P>
              <b>Jogalap:</b> szerződés teljesítése -- a funkció a Vizsgáló cég aktív,
              önkéntes kezdeményezésére fut le (6. cikk (1) b)).
            </P>

            <SubTitle>3.5. Fizetés és számlázás (Stripe)</SubTitle>
            <P>
              Az előfizetési díjak, eseti kredit-/vizsgálatkeret-vásárlások
              feldolgozása a Stripe (Stripe Payments Europe, Ltd., illetve a Stripe,
              Inc. csoport) bankkártya-elfogadó rendszerén keresztül történik. A
              bankkártyaadatokat (kártyaszám, lejárat, CVC) <b>mi soha nem látjuk és
              nem tároljuk</b> -- azokat közvetlenül a Stripe PCI-DSS tanúsítvánnyal
              rendelkező rendszere kezeli. Hozzánk a fizetés eredménye, a számlázási
              név/cím (ha megadásra kerül) és a tranzakció azonosítója jut el.
            </P>
            <P>
              <b>Jogalap:</b> szerződés teljesítése (6. cikk (1) b)); a kiállított
              számlák megőrzése tekintetében jogi kötelezettség teljesítése (6. cikk
              (1) c)) a számvitelről szóló 2000. évi C. törvény alapján.
            </P>

            <SubTitle>3.6. Sütik és helyi tárolás</SubTitle>
            <P>
              A Szolgáltatás kizárólag a működéshez feltétlenül szükséges,
              &bdquo;essential&rdquo; sütiket használ, külön hozzájárulást (cookie
              banner) igénylő marketing- vagy elemző (analitikai) süti jelenleg nincs
              a rendszerben:
            </P>
            <DefinitionList
              items={[
                [
                  'sb-access-token / sb-refresh-token',
                  'Supabase Auth bejelentkezési munkamenet fenntartása (httpOnly, a JavaScript nem éri el). Feltétlenül szükséges, jogalap: jogos érdek / szerződés teljesítése.',
                ],
                [
                  'Világos/sötét téma beállítás',
                  'A böngésző helyi tárolójában (localStorage) rögzített kényelmi beállítás, nem minősül sütinek, a szervert nem éri el.',
                ],
              ]}
            />

            <SubTitle>3.7. Rendszergazdai (Platform Admin) hozzáférés</SubTitle>
            <P>
              Az Adatkezelő belső, szűk körű adminisztrátori felületet (
              <Code>/admin</Code>) tart fenn az előfizetői szervezetek
              csomagszintjének, jogosultságainak kezelésére és az ügyfélszolgálati
              hibaelhárításhoz. Ehhez kizárólag az Adatkezelő megbízásából eljáró,
              titoktartásra kötelezett személyek férnek hozzá.
            </P>
            <P>
              <b>Jogalap:</b> jogos érdek -- a Szolgáltatás biztonságos üzemeltetése,
              visszaélések megelőzése, ügyfélszolgálat (6. cikk (1) f)).
            </P>

            <SubTitle>3.8. Megőrzési idő</SubTitle>
            <List
              items={[
                <>
                  <b>Fiókadatok (e-mail, cégprofil, szerepkör):</b> a fiók fennállásáig,
                  illetve a fiók törléséig.
                </>,
                <>
                  <b>Számviteli bizonylatok (számlák):</b> a számvitelről szóló 2000.
                  évi C. törvény 169. §-a alapján <b>8 évig</b>.
                </>,
                <>
                  <b>AI-felhasználási és biztonsági naplók (usage_logs):</b> a
                  kreditelszámolás és a visszaélések kivizsgálásának céljából, az
                  előfizetői jogviszony fennállása alatt, azt követően legfeljebb a
                  polgári jogi elévülési időn (5 év, Ptk. 6:22. §) belül.
                </>,
              ]}
            />

            <SubTitle>3.9. Fiók törlése</SubTitle>
            <P>
              A Beállítások -- Veszélyzóna menüpontban a felhasználó saját fiókja
              bármikor, önállóan, végleg törölhető (e-mail cím megerősítésével). A
              törlés a bejelentkezési fiókot és a hozzá kötött személyes adatokat
              (e-mail, hitelesítési adatok) véglegesen megszünteti.{' '}
              <b>
                A korábban rögzített vizsgálatok (autóadatok, fotók, riportok) a
                Vizsgáló cég (szervezet) üzleti adataként megmaradnak
              </b>{' '}
              -- ez szándékos, mert ezek nem kizárólag a törölt személyhez, hanem a
              céghez, mint önálló üzleti/számviteli irathoz tartoznak; a törölt
              felhasználóra való hivatkozás (pl. &bdquo;Átvizsgálást végezte&rdquo;
              mező) ilyenkor automatikusan eltávolításra kerül a rekordból.
            </P>

            <SectionTitle number="4">
              II. rész -- Adatfeldolgozói szerepünk: a Megrendelők (autó vevője)
              adatai a publikus riporton
            </SectionTitle>
            <Callout>
              Ebben a körben <b>NEM mi vagyunk az Adatkezelő</b>. Az Adatkezelő maga a
              Vizsgáló cég, amely a saját ügyfelével (a Megrendelővel) áll
              jogviszonyban, és eldönti, milyen adatot rögzít róla, illetve tesz
              közzé a riporton. Mi kizárólag technikai <b>Adatfeldolgozóként</b>
              biztosítjuk a tárhelyet és az infrastruktúrát a GDPR 28. cikke szerinti
              feldolgozói minőségben, az Előfizetői Szerződés / Általános Szerződési
              Feltételek szerint.
            </Callout>

            <SubTitle>4.1. Milyen adatokat érint</SubTitle>
            <List
              items={[
                <>A vizsgált gépjármű adatai (márka, modell, évjárat, alvázszám/VIN, rendszám, km óra állás) -- ezek jellemzően nem a Megrendelő, hanem a jármű adatai.</>,
                <>A Megrendelő neve, telefonszáma és e-mail címe -- a Vizsgáló cég döntése alapján, <b>opcionálisan</b> rögzíthető egy vizsgálathoz.</>,
                <>A vizsgálat során készült fotók és videók (sérülések, felszereltség, általános állapot) -- ezek elsődlegesen a járművet ábrázolják, előfordulhat, hogy háttérben személyt is rögzítenek.</>,
              ]}
            />

            <SubTitle>4.2. A publikus riport link működése</SubTitle>
            <P>
              A riportot a Vizsgáló cég egy egyedi, véletlenszerűen generált,
              gyakorlatilag kitalálhatatlan azonosítóval (UUID) ellátott linken (
              <Code>/report/[egyedi-token]</Code>) teszi elérhetővé, amelyet a saját
              belátása szerint oszt meg a Megrendelővel. A link megnyitásához nincs
              szükség bejelentkezésre.
            </P>
            <P>
              <b>A Megrendelő elérhetőségi adatai (telefon, e-mail) alapértelmezetten
              NEM jelennek meg a publikus riporton</b> -- ehhez a Vizsgáló cégnek a
              vizsgálat véglegesítésekor kifejezetten be kell kapcsolnia a
              &bdquo;Megrendelő adatainak megjelenítése&rdquo; kapcsolót. Ez a
              korlátozás szerveroldalon (nem csak a felületen) érvényesül: kikapcsolt
              állapotban a Megrendelő adatai a hálózati válaszban sem szerepelnek. Az
              Átvizsgáló nevének megjelenítése -- mivel az szakmai/bizalomépítő adat,
              nem a Megrendelőé -- alapértelmezetten bekapcsolt, de ez is
              kikapcsolható.
            </P>

            <SubTitle>4.3. A Vizsgáló cég felelőssége</SubTitle>
            <P>
              Mivel a Vizsgáló cég e körben önálló Adatkezelő, <b>rá hárul a
              felelősség</b>, hogy a saját Megrendelőjét a vonatkozó jogszabályok
              szerint tájékoztassa arról, hogy adatait rögzíti és -- a fenti kapcsoló
              bekapcsolása esetén -- egy nyilvánosan (bejelentkezés nélkül) elérhető
              linken közzéteszi, és hogy ehhez szükség esetén beszerezze a
              Megrendelő hozzájárulását vagy más megfelelő jogalapot biztosítson.
              Javasoljuk Vizsgáló partnereinknek, hogy a Megrendelővel kötött
              megbízási/vizsgálati szerződésükben vagy szóban erről tájékoztassák
              ügyfelüket.
            </P>

            <SubTitle>4.4. Megőrzés e körben</SubTitle>
            <P>
              A riportadatokat a Vizsgáló cég előfizetői fiókjának/szervezetének
              fennállásáig, illetve a Vizsgáló cég kifejezett törlési kérelméig
              tároljuk -- a törlés ütemezéséről és módjáról a Vizsgáló cég (mint
              Adatkezelő) rendelkezik, ezt a Beállítások felületén saját maga
              elvégezheti (adott vizsgálat törlése), vagy tőlünk kérheti.
            </P>

            <SectionTitle number="5">
              Közös rendelkezések -- adattovábbítás, címzettek
            </SectionTitle>
            <P>
              A Szolgáltatás működtetéséhez az alábbi adatfeldolgozókat/külső
              szolgáltatókat vesszük igénybe, mindkét fenti adatkör (I. és II. rész)
              tekintetében:
            </P>
            <DefinitionList
              items={[
                [
                  'Supabase, Inc.',
                  'Adatbázis, hitelesítés és fájltárhely (fotók/videók). Az adatbázis és a tárhely az Európai Unió területén (Frankfurt, Németország -- AWS eu-central-1 régió) van elhelyezve.',
                ],
                [
                  'Google Ireland Limited / Google LLC',
                  'Gemini API -- az AI-funkciókhoz beküldött szöveg/kép feldolgozása (lásd 3.4. pont). Az adattovábbítás az Európai Gazdasági Térségen kívülre (USA) is történhet, a GDPR 46. cikke szerinti megfelelő garanciák (általános adatvédelmi szerződési feltételek -- Standard Contractual Clauses) mellett.',
                ],
                [
                  'Stripe Payments Europe, Ltd. / Stripe, Inc.',
                  'Fizetési és számlázási szolgáltatás (lásd 3.5. pont). Az adattovábbítás az Európai Gazdasági Térségen kívülre is történhet, megfelelő garanciák (Standard Contractual Clauses) mellett.',
                ],
                [
                  'Vercel Inc.',
                  'A Szolgáltatás webalkalmazásának hostingja (a kód futtatása, nem tárol tartós adatbázist).',
                ],
              ]}
            />
            <P>
              Az adatokat harmadik félnek reklám-, piackutatási vagy egyéb, a fenti
              céloktól eltérő célra <b>nem adjuk el és nem továbbítjuk</b>. Adatot
              hatóság részére kizárólag jogszabályi kötelezettség (pl. bírósági vagy
              nyomozó hatósági megkeresés) alapján adunk ki.
            </P>

            <SectionTitle number="6">Adatbiztonság</SectionTitle>
            <List
              items={[
                <>Az adatbázis <b>sor-szintű biztonsági szabályokkal (Row-Level Security)</b> védett minden táblán -- egy előfizető kizárólag a saját szervezetéhez tartozó adatokhoz férhet hozzá, más cég adataihoz technikailag sem.</>,
                <>Az adatforgalom végponttól végpontig titkosított (HTTPS/TLS).</>,
                <>Jelszó nélküli hitelesítés (Magic Link, Passkey) -- csökkenti a jelszó-alapú fiókfeltörés kockázatát.</>,
                <>A fiók végleges törléséhez szükséges, RLS-t megkerülő rendszerkulcs kizárólag a szerveroldalon, korlátozott hozzáféréssel érhető el.</>,
              ]}
            />

            <SectionTitle number="7">Az érintettek jogai</SectionTitle>
            <P>A GDPR alapján Önt (mind a Vizsgáló cég felhasználójaként, mind Megrendelőként) az alábbi jogok illetik meg:</P>
            <List
              items={[
                <><b>Hozzáférés joga</b> (15. cikk): tájékoztatást kérhet arról, kezeljük-e adatait, és ha igen, milyen adatait, milyen célból.</>,
                <><b>Helyesbítés joga</b> (16. cikk): kérheti a pontatlan adatok kijavítását.</>,
                <><b>Törlés joga</b> (17. cikk, &bdquo;elfeledtetéshez való jog&rdquo;): kérheti adatai törlését, ha azok kezelésére már nincs szükség, vagy jogellenesen kezeljük azokat.</>,
                <><b>Az adatkezelés korlátozásához való jog</b> (18. cikk).</>,
                <><b>Adathordozhatósághoz való jog</b> (20. cikk): tagolt, géppel olvasható formátumban kérheti a rá vonatkozó adatokat.</>,
                <><b>Tiltakozás joga</b> (21. cikk) jogos érdeken alapuló adatkezelés ellen.</>,
                <>Amennyiben a Vizsgáló cég ügyfele (Megrendelő), és a fentiek a saját adataira vonatkoznak, e jogokat elsődlegesen a <b>Vizsgáló cégnél, mint Adatkezelőnél</b> gyakorolhatja -- mi feldolgozóként segítjük ennek teljesítését.</>,
              ]}
            />
            <P>
              Jogai gyakorlásához forduljon hozzánk a fenti (1. pont szerinti)
              elérhetőségen.
            </P>

            <SectionTitle number="8">Jogorvoslati lehetőségek</SectionTitle>
            <P>
              Amennyiben megítélése szerint adatait jogellenesen kezeljük, panasszal
              élhet a <b>Nemzeti Adatvédelmi és Információszabadság Hatóságnál</b>{' '}
              (cím: 1055 Budapest, Falk Miksa utca 9-11.; postacím: 1363 Budapest,
              Pf. 9.; e-mail: <Code>ugyfelszolgalat@naih.hu</Code>; honlap:{' '}
              <Code>naih.hu</Code>), vagy jogorvoslatért fordulhat a lakóhelye/
              tartózkodási helye szerint illetékes törvényszékhez.
            </P>

            <SectionTitle number="9">A tájékoztató módosítása</SectionTitle>
            <P>
              A jelen tájékoztatót a Szolgáltatás fejlődésével (új funkciók, új
              adatfeldolgozók bevonása) időről időre frissíthetjük. A mindenkor
              hatályos verzió ezen az oldalon érhető el, a lap tetején feltüntetett
              hatálybalépési dátummal. Lényeges változásról a bejelentkezett
              felhasználókat e-mailben vagy a Szolgáltatáson belüli értesítéssel
              tájékoztatjuk.
            </P>

            <SectionTitle number="10">Kapcsolat</SectionTitle>
            <P>
              Adatvédelemmel kapcsolatos kérdés, kérelem esetén írjon nekünk:{' '}
              <a
                href="mailto:info@buildmysite.hu"
                className="font-normal text-stripe-primary hover:underline"
              >
                info@buildmysite.hu
              </a>
              .
            </P>
          </Prose>
        </div>

        <p className="mt-8 text-center font-sohne text-[13px] font-light text-stripe-ink-mute">
          &copy; {new Date().getFullYear()} CarPass -- Mányi Levente EV.
        </p>
      </main>
    </div>
  );
}

/* -------------------------------------------------------------------------------
 * Belső, csak ezen az oldalon használt tipográfiai segédkomponensek -- a projektben
 * nincs telepítve @tailwindcss/typography plugin, ezért a jogi szöveg egységes
 * megjelenítését (Stripe design tokenek: font-sohne, stripe-ink/-ink-mute, hairline
 * elválasztók) kézzel, ezekkel a wrapperekkel biztosítjuk.
 * ------------------------------------------------------------------------------- */

function Prose({ children }: { children: ReactNode }) {
  return <div className="flex flex-col gap-4">{children}</div>;
}

function SectionTitle({ number, children }: { number: string; children: ReactNode }) {
  return (
    <h2 className="mt-6 border-t border-stripe-hairline pt-6 font-sohne text-[20px] font-medium leading-[1.3] text-stripe-ink first:mt-0 first:border-t-0 first:pt-0">
      <span className="text-stripe-primary">{number}.</span> {children}
    </h2>
  );
}

function SubTitle({ children }: { children: ReactNode }) {
  return (
    <h3 className="mt-2 font-sohne text-[16px] font-medium text-stripe-ink">{children}</h3>
  );
}

function P({ children }: { children: ReactNode }) {
  return (
    <p className="font-sohne text-[15px] font-light leading-[1.65] text-stripe-ink-secondary">
      {children}
    </p>
  );
}

function List({ items }: { items: ReactNode[] }) {
  return (
    <ul className="flex flex-col gap-2 pl-1">
      {items.map((item, index) => (
        <li
          key={index}
          className="flex gap-2 font-sohne text-[15px] font-light leading-[1.65] text-stripe-ink-secondary before:mt-[10px] before:h-[5px] before:w-[5px] before:shrink-0 before:rounded-full before:bg-stripe-primary-subdued"
        >
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

function DefinitionList({ items }: { items: [ReactNode, ReactNode][] }) {
  return (
    <dl className="flex flex-col gap-3 rounded-stripe-md border border-stripe-hairline bg-stripe-canvas-soft p-4">
      {items.map(([term, value], index) => (
        <div key={index} className="flex flex-col gap-0.5 sm:flex-row sm:gap-3">
          <dt className="w-full shrink-0 font-sohne text-[13px] font-medium text-stripe-ink sm:w-[220px]">
            {term}
          </dt>
          <dd className="font-sohne text-[14px] font-light text-stripe-ink-mute">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function Callout({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-stripe-md border border-stripe-primary/25 bg-stripe-primary/5 p-4 font-sohne text-[14px] font-light leading-[1.6] text-stripe-ink-secondary">
      {children}
    </div>
  );
}

function Code({ children }: { children: ReactNode }) {
  return (
    <code className="rounded-stripe-xs bg-stripe-canvas-soft px-1.5 py-0.5 font-mono text-[13px] text-stripe-ink-secondary">
      {children}
    </code>
  );
}
