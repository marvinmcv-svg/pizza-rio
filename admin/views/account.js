/* Mi cuenta: datos y cambio de contraseña propia. */
import { sb, S, $, esc, ROLE, phoneFmt, toast, errMsg } from "../lib.js";

export default async function (el) {
  const st = S.storeById[S.me.store_id];
  el.innerHTML = '<div class="card" style="max-width:520px;display:grid;gap:14px"><dl class="kv"><dt>Nombre</dt><dd>' + esc(S.me.full_name) + "</dd><dt>Email</dt><dd>" + esc(S.me.email || "") + "</dd><dt>Rol</dt><dd>" + esc(ROLE[S.me.role]) + "</dd><dt>Sucursal</dt><dd>" + esc(st ? st.name : "Todas") + "</dd>" + (S.me.phone ? "<dt>Celular</dt><dd>" + esc(phoneFmt(S.me.phone)) + "</dd>" : "") + "</dl>" +
    '<form id="pwForm" style="display:grid;gap:10px"><h2 style="font-size:1.1rem">Cambiar contraseña</h2><label>Nueva contraseña (mín. 8)<input type="password" name="pw" minlength="8" required autocomplete="new-password"></label><label>Repetila<input type="password" name="pw2" minlength="8" required autocomplete="new-password"></label><button class="btn btn--red" type="submit">Cambiar contraseña</button></form></div>';
  $("#pwForm", el).addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    if (f.get("pw") !== f.get("pw2")) return toast("Las contraseñas no coinciden", "bad");
    const { error } = await sb.auth.updateUser({ password: String(f.get("pw")) });
    if (error) return toast(errMsg(error), "bad");
    e.target.reset(); toast("Contraseña cambiada", "ok");
  });
}
