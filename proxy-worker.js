/* Необязательный посредник для кнопки «🔄 Обновить с сайта».
   Зачем: браузер не может сам сходить на muiv.ru — мешает CORS.
   Куда положить: Cloudflare Workers (бесплатный тариф) → Create Worker →
   вставить этот код → Deploy. Получите адрес вида
   https://rasp.ВАШ-ЛОГИН.workers.dev
   Затем в боте: ✏️ Редактировать → поле «Свой CORS-прокси» →
   https://rasp.ВАШ-ЛОГИН.workers.dev/?url={url}

   Честное предупреждение: muiv.ru стоит за Bitrix-защитой и WAF, которые
   отдают заглушку всем, кроме настоящего браузера. Этот воркер снимает
   только проблему CORS. Если сайт отдаст заглушку — бот об этом скажет,
   и надёжным останется ручной импорт («📥 Вставить расписание»).

   Второй, более полезный режим: отдавать боту готовый JSON. Если вы
   наполните ниже объект MANUAL (или будете складывать данные в KV),
   воркер вернёт их, и кнопка «Обновить» станет рабочей.
   Формат: {"days":{"2026-09-22":[{"t":"09:00–10:30","s":"Математика","r":"каб.312","p":"Иванов И.И."}]}}
   Либо постоянная неделя: {"week":{"1":[...],"2":[...]}} (1 = понедельник). */

const MANUAL = null; // например: {days:{"2026-09-22":[{t:"09:00–10:30",s:"Математика"}]}}

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,OPTIONS',
  'Access-Control-Allow-Headers': '*'
};

export default {
  async fetch(request) {
    if (request.method === 'OPTIONS') return new Response(null, { headers: CORS });

    if (MANUAL) {
      return new Response(JSON.stringify(MANUAL), {
        headers: { ...CORS, 'content-type': 'application/json; charset=utf-8' }
      });
    }

    const target = new URL(request.url).searchParams.get('url');
    if (!target) return new Response('нужен параметр ?url=', { status: 400, headers: CORS });

    // Пропускаем только сайт университета, чтобы воркер не стал открытым прокси.
    let host;
    try { host = new URL(target).hostname; } catch (e) { return new Response('плохой url', { status: 400, headers: CORS }); }
    if (!/(^|\.)muiv\.ru$/.test(host)) return new Response('разрешён только muiv.ru', { status: 403, headers: CORS });

    const upstream = await fetch(target, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'ru-RU,ru;q=0.9'
      },
      redirect: 'follow'
    });

    const body = await upstream.text();
    return new Response(body, {
      status: upstream.status,
      headers: { ...CORS, 'content-type': 'text/html; charset=utf-8' }
    });
  }
};
