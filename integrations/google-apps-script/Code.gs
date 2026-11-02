/**
 * AntyObzhelp — отправка ответов Google Forms на сервер.
 *
 * Установка (в редакторе скриптов формы: Форма → ⋮ → Редактор скриптов):
 *   1. Вставьте этот файл в Code.gs.
 *   2. Настройки проекта → Свойства скрипта: добавьте
 *        AOH_ENDPOINT = https://<ваш-домен>/api/integrations/google-forms
 *        AOH_SECRET   = <значение GOOGLE_FORMS_SECRET с сервера>
 *   3. Запустите функцию setup() один раз и выдайте разрешения.
 * Секрет хранится только в свойствах скрипта, не в коде.
 */

var MAX_ATTEMPTS = 5;

function setup() {
  var form = FormApp.getActiveForm();
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'onFormSubmit' || t.getHandlerFunction() === 'retryPending') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('onFormSubmit').forForm(form).onFormSubmit().create();
  // Повтор неудачных доставок каждые 10 минут.
  ScriptApp.newTrigger('retryPending').timeBased().everyMinutes(10).create();
  Logger.log('Триггеры установлены');
}

function onFormSubmit(e) {
  var payload = buildPayload(e.response);
  if (!deliver(payload)) queue(payload);
}

function buildPayload(response) {
  var answers = response.getItemResponses().map(function (ir) {
    var item = ir.getItem();
    var value = ir.getResponse();
    if (Array.isArray(value)) value = value.map(String);
    else value = value == null ? '' : String(value);
    return { question: item.getTitle(), answer: value, itemId: item.getId() };
  });
  return {
    responseId: response.getId(),
    formId: FormApp.getActiveForm().getId(),
    timestamp: response.getTimestamp().toISOString(),
    respondentEmail: response.getRespondentEmail() || null,
    answers: answers,
  };
}

function sign(secret, ts, body) {
  var raw = Utilities.computeHmacSha256Signature(ts + '.' + body, secret, Utilities.Charset.UTF_8);
  return raw.map(function (b) { return ('0' + (b & 0xff).toString(16)).slice(-2); }).join('');
}

/** true — сервер принял (или это дубль), false — нужно повторить позже. */
function deliver(payload) {
  var props = PropertiesService.getScriptProperties();
  var endpoint = props.getProperty('AOH_ENDPOINT');
  var secret = props.getProperty('AOH_SECRET');
  if (!endpoint || !secret) throw new Error('Не заданы AOH_ENDPOINT / AOH_SECRET в свойствах скрипта');
  var body = JSON.stringify(payload);
  var ts = String(Date.now());
  try {
    var res = UrlFetchApp.fetch(endpoint, {
      method: 'post',
      contentType: 'application/json',
      payload: body,
      headers: { 'X-AOH-Timestamp': ts, 'X-AOH-Signature': sign(secret, ts, body) },
      muteHttpExceptions: true,
    });
    var code = res.getResponseCode();
    if (code >= 200 && code < 300) return true;
    // 4xx (кроме 408/429) — ошибка данных/подписи, повтор не поможет: фиксируем в логе.
    if (code >= 400 && code < 500 && code !== 408 && code !== 429) {
      console.error('AntyObzhelp отклонил ответ ' + payload.responseId + ': ' + code + ' ' + res.getContentText());
      return true;
    }
    console.warn('AntyObzhelp временно недоступен: ' + code);
    return false;
  } catch (err) {
    console.warn('Сеть: ' + err);
    return false;
  }
}

function queue(payload) {
  var props = PropertiesService.getScriptProperties();
  props.setProperty('pending_' + payload.responseId, JSON.stringify({ p: payload, n: 1 }));
}

function retryPending() {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) return;
  try {
    var props = PropertiesService.getScriptProperties();
    var all = props.getProperties();
    Object.keys(all).forEach(function (key) {
      if (key.indexOf('pending_') !== 0) return;
      var item = JSON.parse(all[key]);
      if (deliver(item.p)) props.deleteProperty(key);
      else if (item.n + 1 >= MAX_ATTEMPTS) {
        console.error('Не удалось доставить ответ ' + item.p.responseId + ' после ' + MAX_ATTEMPTS + ' попыток');
        props.deleteProperty(key);
      } else props.setProperty(key, JSON.stringify({ p: item.p, n: item.n + 1 }));
    });
  } finally {
    lock.releaseLock();
  }
}

/** Повторно отправить все ответы формы (сервер пропустит уже обработанные). */
function resendAll() {
  FormApp.getActiveForm().getResponses().forEach(function (r) { deliver(buildPayload(r)); });
}
