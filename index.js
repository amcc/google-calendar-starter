const fs = require("fs").promises;
const path = require("path");
const process = require("process");
const { authenticate } = require("@google-cloud/local-auth");
const { google } = require("googleapis");

// If modifying these scopes, delete token.json.
const SCOPES = ["https://www.googleapis.com/auth/calendar.readonly"];
// The file token.json stores the user's access and refresh tokens, and is
// created automatically when the authorization flow completes for the first
// time.
const TOKEN_PATH = path.join(process.cwd(), "token.json");
const CREDENTIALS_PATH = path.join(process.cwd(), "credentials.json");

/**
 * Reads previously authorized credentials from the save file.
 *
 * @return {Promise<OAuth2Client|null>}
 */
async function loadSavedCredentialsIfExist() {
  try {
    const content = await fs.readFile(TOKEN_PATH);
    const credentials = JSON.parse(content);
    return google.auth.fromJSON(credentials);
  } catch (err) {
    return null;
  }
}

/**
 * Serializes credentials to a file compatible with GoogleAUth.fromJSON.
 *
 * @param {OAuth2Client} client
 * @return {Promise<void>}
 */
async function saveCredentials(client) {
  const content = await fs.readFile(CREDENTIALS_PATH);
  const keys = JSON.parse(content);
  const key = keys.installed || keys.web;
  const payload = JSON.stringify({
    type: "authorized_user",
    client_id: key.client_id,
    client_secret: key.client_secret,
    refresh_token: client.credentials.refresh_token,
  });
  await fs.writeFile(TOKEN_PATH, payload);
}

/**
 * Load or request or authorization to call APIs.
 *
 */
async function authorize() {
  let client = await loadSavedCredentialsIfExist();
  if (client) {
    return client;
  }
  client = await authenticate({
    scopes: SCOPES,
    keyfilePath: CREDENTIALS_PATH,
  });
  if (client.credentials) {
    await saveCredentials(client);
  }
  return client;
}

/**
 * List all of the logged in user's calendars.
 * @param {google.auth.OAuth2} auth An authorized OAuth2 client.
 */
async function listCalendars(auth) {
  const calendar = google.calendar({ version: "v3", auth });
  const res = await calendar.calendarList.list({});
  //   console.log(res.data);

  const calendarIds = res.data.items.map((item) => item.id);
  //   console.log(calendarIds);
  //   const allEvents = await Promise.all(
  //     calendarIds.map(async (id) => listEvents(auth, id))
  //   );
  //   console.log(allEvents);

  Promise.all(calendarIds.map(async (id) => listEvents(auth, id))).then(
    (allEvents) => {
      const trimmedEvents = allEvents
        .filter((event) => event !== undefined)
        .flat()
        .sort(function (x, y) {
          return x.start - y.start;
        });

      // trim arrat to events within 24 hours
      const now = new Date();
      const fiveDays = new Date(now.getTime() + 24 * 60 * 60 * 1000 * 5);
      const trimmedEventsFiveDays = trimmedEvents.filter((event) => {
        return event.start < fiveDays;
      });

      //   console.log(trimmedEvents);
      console.log("trimmed", trimmedEventsFiveDays);
    }
  );
}

/**
 * Lists the next 10 events on the user's primary calendar.
 * @param {google.auth.OAuth2} auth An authorized OAuth2 client.
 */
async function listEvents(auth, id = null) {
  const calendar = google.calendar({ version: "v3", auth });
  const res = await calendar.events.list({
    calendarId: id ? id : "primary",
    timeMin: new Date().toISOString(),
    maxResults: 10,
    singleEvents: true,
    orderBy: "startTime",
  });
  const events = res.data.items;
  if (!events || events.length === 0) {
    // console.log("No upcoming events found.");
    return;
  }
  //   console.log("Upcoming 10 events:");
  const calendarEvents = events.map((event, i) => {
    if (i === 0) console.log(event);
    const start = event.start.dateTime || event.start.date;
    // console.log(`${start} - ${event.summary}`);
    return { start: new Date(start), summary: event.summary };
  });
  return calendarEvents;
}

// authorize().then(listEvents).catch(console.error);
// console.log(events);
authorize().then(listCalendars).catch(console.error);
