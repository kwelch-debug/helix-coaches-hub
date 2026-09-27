# Helix Coaches Hub: setup checklist

Do these in order. Each part is independent, and I can walk you through any of them in your browser while you're signed in.

## What runs where

| Automation | Runs on | Computer on? | How to turn it off |
|---|---|---|---|
| Facility calendar + games list (3× a day) | GitHub (cloud) | No | GitHub → Actions → "Update facility calendar" → ··· → Disable workflow |
| Score form → Scores sheet → office email | Google (cloud) | No | Apps Script → Triggers → delete `onScoreSubmit` |
| 9:45 PM score reminder + 7 AM follow-up | Google (cloud) | No | Apps Script → Triggers → delete `reminderTonight` / `reminderFollowup` |
| Weekly clearance email | **Your desktop** reads Home Campus, then Google sends | **Yes**, on and signed in | Pause the scheduled task in Claude |

---

## Part 1: Put the site on GitHub + Netlify (15 min)

1. Create a free account at **github.com**.
2. Click **New repository**. Name it `helix-coaches-hub`, set it to **Public** (the site is public anyway, and this keeps Actions free), and click Create.
3. Click **uploading an existing file** and drag in everything from the `helix-coaches-hub` folder. Then click **Commit changes**.
4. Check that a `.github/workflows/calendar.yml` file is in the repo. Macs hide folders that start with a dot, so it may not have uploaded. If it's missing: **Add file → Create new file**, type the name `.github/workflows/calendar.yml`, paste in the contents of that file, and click **Commit**.
5. Create a free account at **netlify.com** (Sign up with GitHub). Then choose **Add new site → Import an existing project → GitHub →** `helix-coaches-hub`. Leave every setting as-is and click **Deploy**.
6. Rename the site under **Site configuration → Change site name** (for example `helix-coaches`). Your address is now `https://helix-coaches.netlify.app`.
7. Back on GitHub: open **Actions → Update facility calendar → Run workflow**. After about a minute, the This Week tab shows the facility calendar.

**Optional: add your Google facility calendars.** In Google Calendar, go to the calendar's **Settings → Integrate calendar** and copy the **Secret address in iCal format**. On GitHub, go to **Settings → Secrets and variables → Actions → New repository secret**. Name it `GOOGLE_ICS`. For the value, put one calendar per line, in the form `Label|address`, for example `Gym|https://calendar.google.com/...basic.ics`. Secret addresses never go in the files themselves.

> From now on, edits to `index.html` must be made on GitHub (pencil icon), not by dragging files into Netlify. The calendar robot commits to GitHub and would overwrite anything that isn't there.

## Part 2: Score form + reminders (15 min)

1. In Google Drive, create a new Google Sheet named **Helix Athletics Automations**.
2. Go to **Extensions → Apps Script**. Delete the sample code and paste in all of `apps-script/Code.gs`.
3. Click the gear icon (**Project Settings**) and turn on **Show "appsscript.json"**. Replace that file's contents with `apps-script/appsscript.json`. This sets Pacific time.
4. In `Code.gs`, set `SITE_URL` to your Netlify address.
5. Choose **setup** in the function menu and click **Run**. Approve the permissions. Google will warn that the app isn't verified: click **Advanced → Go to project**. This script is yours.
6. Open the sheet's new **Settings** tab and copy two values into the `links` section of `index.html` on GitHub:
   - Score form link → `scoreForm`
   - Pre-filled template → `scoreFormPrefill`
7. Check the **Coaches** tab.
   - **Active = N** skips a coach entirely. Use it for anyone who already posts to MaxPreps and doesn't want reminders.
   - **Remind levels** defaults to Varsity.
   - After any change, run **refreshTeamChoices**.
8. **Test mode is on.** Every reminder goes to you, labeled with who it would have gone to. You can also run **previewReminders** any afternoon to see tonight's list without sending anything. When the emails look right, change `REMINDERS_TEST_MODE: true` to `false`.

## Part 3: Weekly clearance email (next session, with you signed in)

This part reads Home Campus, so it has to run in **your** browser, in a session you opened. I never type or store your password.

1. In the Apps Script editor, go to **Deploy → New deployment → Web app**. Set Execute as **Me** and Who has access to **Anyone**, then click Deploy and copy the web app URL.
2. Sign in to Home Campus in Chrome. Then we'll look together at the page that shows each team's clearance status, and I'll set up a weekly scheduled task. It reads each in-season team, sends the lists to the web app, and a coach gets an email only if their team has a problem.
3. We start in **counts** mode, which emails nobody. Then we switch to **send** with `CLEARANCE_TEST_MODE` on, so everything comes to you first.

If Home Campus has signed you out when the task runs, it stops and tells you. It never attempts a login.
