// One-time "Exhibit sign-in" box, shown on the tablet and the phone until the device is signed in.
// After signing in the page reloads, so it connects with the new permission.
export function showSignIn(fb) {
  if (document.getElementById("signinBox")) return;
  const box = document.createElement("div");
  box.id = "signinBox";
  box.innerHTML = `
    <form style="background:#0d1d3d;border:1px solid rgba(255,255,255,.2);border-radius:20px;padding:22px;width:min(420px,92vw);
      font-family:'Noto Sans',sans-serif;color:#f3f1ea;display:flex;flex-direction:column;gap:12px;text-align:center">
      <strong style="color:#ffb547;font-size:20px">Exhibit sign-in</strong>
      <span style="color:#a9b3c9;font-size:14px">One time on this device. Use the exhibit account made in Firebase.</span>
      <input name="email" type="email" autocomplete="username" placeholder="Email" required
        style="font:inherit;font-size:17px;padding:12px;border-radius:12px;border:1px solid #445;background:#fff;color:#000">
      <input name="pw" type="password" autocomplete="current-password" placeholder="Password" required
        style="font:inherit;font-size:17px;padding:12px;border-radius:12px;border:1px solid #445;background:#fff;color:#000">
      <button style="font:inherit;font-size:18px;font-weight:700;padding:12px;border:0;border-radius:999px;background:#ffb547;color:#08122a">Sign in</button>
      <span class="msg" style="color:#ff8a8a;font-size:14px;min-height:1em"></span>
      <button type="button" class="later" style="font:inherit;font-size:13px;background:none;border:0;color:#a9b3c9;text-decoration:underline">Not now</button>
    </form>`;
  Object.assign(box.style, { position: "fixed", inset: "0", zIndex: "100", display: "flex", alignItems: "center",
    justifyContent: "center", background: "rgba(3,8,20,.85)" });
  document.body.appendChild(box);
  const form = box.querySelector("form");
  form.addEventListener("submit", async e => {
    e.preventDefault();
    const msg = box.querySelector(".msg");
    msg.textContent = "Signing in…";
    try {
      await fb.signIn(form.email.value.trim(), form.pw.value);
      location.reload();
    } catch (err) {
      msg.textContent = /invalid|wrong|not-found|credential/i.test(err.code || "") ? "Wrong email or password." :
        /operation-not-allowed/.test(err.code || "") ? "Email sign-in is not switched on in Firebase yet." :
        "Could not sign in: " + (err.code || err.message);
    }
  });
  box.querySelector(".later").onclick = () => box.remove();
}
