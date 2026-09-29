# Budget Manager (PWA)

Shaxsiy budget ilovasi: daromad, xarajat, oylik budget, kartalar, qarzlar, emergency va sinking fondlar, takroriy va rejali to‘lovlar, statistika.

- Internetsiz ishlaydi (service worker)
- Ma’lumotlar faqat telefonda saqlanadi (`localStorage`) — server, login, tashqi kutubxona yo‘q
- Hech qanday summa kodda yo‘q: hammasi ilova ichida kiritiladi va o‘zgartiriladi

**Ilova:** https://mirfayzlutfullayev.github.io/budget/

## iPhone’ga o‘rnatish

1. Safari’da https://mirfayzlutfullayev.github.io/budget/ ni oching
2. Pastdagi **Ulashish** (⬆︎) → **Add to Home Screen / На экран «Домой»**
3. Ekrandagi **Budget** ikonkasidan oching

## Zaxira

Ma’lumotlar telefon brauzerida saqlanadi. Ilovani ekrandan o‘chirsangiz yoki Safari ma’lumotlarini tozalasangiz, ular yo‘qoladi. Vaqti-vaqti bilan **Sozlamalar → Zaxira nusxa olish** orqali JSON faylni iCloud Drive’ga saqlang. Tiklash: **Sozlamalar → Zaxiradan tiklash**.

## Tuzilma

```
index.html, manifest.webmanifest, sw.js
css/app.css
js/util.js     pul formatlash, sanalar
js/engine.js   barcha hisob-kitoblar (faqat o‘qiydi)
js/store.js    ma’lumotlar va o‘zgartirish amallari
js/charts.js   SVG diagrammalar
js/ui.js       ekranlar, formalar, hodisalar
js/app.js      ishga tushirish
test/          node testlari
```

## Testlar

```
node --test test/finance.test.js
```

## Yangilash

Kodni o‘zgartirgandan keyin `sw.js` dagi `VERSION`ni oshiring — telefonlar yangi versiyani oladi.
