# Budget Manager

Shaxsiy kirim-chiqim va budjet ilovasi (PWA).

**Ilova:** https://mirfayzlutfullayev.github.io/budget/

> Foydalanuvchi hisob-kitob qilmaydi. Faqat pul kirganini yoki chiqqanini kiritadi — qolganini ilova o‘zi hisoblaydi.

## iPhone’ga o‘rnatish

1. **Safari**’da yuqoridagi manzilni oching
2. **Ulashish** (⬆︎) → **Add to Home Screen / На экран «Домой»**
3. Doim **ekrandagi ikonkadan** oching (Safari va ekrandagi ilova ma’lumotlari alohida saqlanadi)

## Imkoniyatlar

- **Asosiy ekran:** Total Money, Safe to Spend, kirim/chiqim, tejaldi/oshib ketdi, budjet, qarz, Coming Soon, eslatmalar
- **Tez kiritish:** `+` → Chiqim → summa → kategoriya → Saqlash (oxirgi hisob avtomatik tanlanadi)
- Hisoblar (naqd, karta), o‘tkazmalar (xarajat emas), qarzlar va to‘lovlar
- Oylik budjet, limitlar, budjet va haqiqat
- Kutilgan kirim (Expected → Received), rejali xaridlar (Planned → Purchased / Cancelled), majburiy to‘lovlar
- Statistika: kirim va chiqim, kategoriyalar (bosilganda tranzaksiyalar), budjet va haqiqat, qarz dinamikasi
- **Hisobotlar:** oy / yil / ixtiyoriy davr bo‘yicha **PDF** va **Excel**
- **Eslatmalar:** ilova ichida + iPhone **Kalendariga** (.ics) — ilova yopiq bo‘lsa ham telefon eslatadi
- **Qanday hisoblanadi:** barcha qoidalar sizning raqamlaringiz bilan

## Kartalar bo‘yicha taqsimot (konvertlar)

- **Mening rejam** (Ko‘proq → Mening rejam): har bir karta vazifasi, oylik ulushi va kategoriyalari. Mavjud kartalar/kategoriyalar nomi bo‘yicha topiladi va qayta ishlatiladi — hech narsa o‘chmaydi, oldin avtomatik nusxa olinadi.
- **Qat’iy karta** (masalan TBC — ovqat, yo‘l, telefon; 6418 — kurs, ijara, kiyim): boshqa narsaga ishlatilsa — formada, Dashboard’da, tarixda va eslatmalarda qizil ogohlantirish.
- **Erkin karta** (Main, naqd): istalgan xarajat.
- Kategoriya tanlanganda uning kartasi avtomatik tanlanadi.
- **Taqsimlash:** maosh tushgach bir bosishda kartalarga o‘tkazma (xarajat emas).
- Dashboard’da har bir karta: limit, sarflangan, qolgan, kuniga qancha mumkin, shu tempda oy oxiri prognozi.
- **Kunlik limit:** bugun va birinchi yozuvdan beri reja bilan solishtirish.

## Ma’lumotlarni yo‘qotmaslik

| Himoya | Nima qiladi |
|---|---|
| Ikki joyda saqlash | IndexedDB + localStorage; biri buzilsa ikkinchisidan tiklanadi va darhol qayta yoziladi |
| Avtomatik nusxalar | Har kuni + tiklash/import/o‘chirishdan oldin; 14 kun saqlanadi, istalganiga qaytish mumkin |
| Doimiy saqlash | Brauzerdan `persistent storage` so‘raladi |
| Bekor qilish | O‘chirgandan keyin 6 soniya ichida «Bekor qilish» |
| Zaxira fayl | JSON → iCloud Drive; har N kunda eslatadi; «Fayldan tiklash» |
| Himoyalangan o‘chirish | Tranzaksiyasi bor hisob/kategoriya/qarzni o‘chirib bo‘lmaydi (faqat yashiriladi) |
| Xavfsiz yuklash | Yuklashda xato bo‘lsa ilova ochilmaydi — bo‘sh holat eski ma’lumot ustidan yozilmaydi |
| 1-versiyadan ko‘chirish | Eski ma’lumot avtomatik ko‘chiriladi, asl nusxasi arxivda umrbod saqlanadi |

## Texnologiya

React · TypeScript · Vite · Tailwind CSS · Recharts · vite-plugin-pwa · jsPDF · SheetJS · Vitest

```
src/domain/    types, engine (barcha hisob-kitob), actions (o‘zgartirish + validatsiya), migrate
src/store/     persist (IndexedDB + localStorage + nusxalar), store, ui (navigatsiya, oynalar, xabarlar)
src/lib/       format, reports (PDF/Excel), ics (kalendar), share
src/screens/   Home, Transactions, Budget, Stats, More, Data, Onboarding
src/sheets/    barcha formalar
```

## Ishlab chiqish

```
npm install
npm run dev      # lokal
npm test         # testlar
npm run build    # tip tekshiruvi + build
```

`main`’ga push qilinganda GitHub Actions testlarni o‘tkazadi va o‘tsa — saytni yangilaydi.
