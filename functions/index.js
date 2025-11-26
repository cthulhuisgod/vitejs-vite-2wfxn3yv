const functions = require("firebase-functions");
const admin = require("firebase-admin");
const { google } = require("googleapis");
const axios = require("axios");
const cors = require("cors")({ origin: true });

// --- 1. INITIALIZATION & CONFIGURATION ---

// Initialize Firebase Admin SDK for Firestore access
admin.initializeApp();
const db = admin.firestore();

// IMPORTANT: Replace this placeholder with your actual Hubspot Private App Access Token.
// For production, store this securely in Firebase environment config (process.env.HUBSPOT_KEY)
const HUBSPOT_API_KEY = "PLACEHOLDER_FOR_YOUR_HUBSPOT_PRIVATE_APP_KEY";
const HUBSPOT_CONTACTS_API = 'https://api.hubapi.com/crm/v3/objects/contacts';

// --- 2. GMAIL/EMAIL FETCHING FUNCTION (Your existing code) ---

exports.getRecentEmails = functions.https.onRequest((req, res) => {
  cors(req, res, async () => {
    // Only allow POST requests for security
    if (req.method !== 'POST') {
      return res.status(405).send({ error: "Method Not Allowed. Use POST." });
    }
    
    try {
      const accessToken = req.body.token;
      if (!accessToken) return res.status(400).send({ error: "Missing Token" });

      const auth = new google.auth.OAuth2();
      auth.setCredentials({ access_token: accessToken });
      const gmail = google.gmail({ version: "v1", auth });

      const listResponse = await gmail.users.messages.list({
        userId: "me",
        maxResults: 5,
        q: "is:unread",
      });

      const messages = listResponse.data.messages || [];
      const emailDetails = [];

      for (const message of messages) {
        const details = await gmail.users.messages.get({ userId: "me", id: message.id });
        const headers = details.data.payload.headers;
        const subject = headers.find((h) => h.name === "Subject")?.value;
        const from = headers.find((h) => h.name === "From")?.value;
        emailDetails.push(`- From: ${from}\n  Subject: ${subject}`);
      }

      res.status(200).send({ emails: emailDetails.join("\n\n") });
    } catch (error) {
      console.error("Gmail Fetch Error:", error);
      res.status(500).send({ error: error.message });
    }
  });
});

// --- 3. HUBSPOT IMPORT FUNCTION (New code) ---

exports.importFromHubspot = functions.https.onRequest(async (req, res) => {
  cors(req, res, async () => {
    if (req.method !== 'POST') {
      return res.status(405).send({ error: "Method Not Allowed. Use POST." });
    }

    const { shopId } = req.body;
    
    if (!shopId) {
      return res.status(400).send({ error: "Missing 'shopId' in request body." });
    }
    
    // Safety check for API Key configuration
    if (HUBSPOT_API_KEY === "PLACEHOLDER_FOR_YOUR_HUBSPOT_PRIVATE_APP_KEY") {
        return res.status(503).send({ error: "Hubspot API Key is not configured in the function environment." });
    }

    let importedCount = 0;
    
    try {
      // --- Fetch Contacts from Hubspot ---
      
      const properties = ['firstname', 'lastname', 'email', 'phone', 'notes']; 
      
      const hubspotResponse = await axios.get(HUBSPOT_CONTACTS_API, {
        params: {
          properties: properties.join(','),
          limit: 100
        },
        headers: {
          'Authorization': `Bearer ${HUBSPOT_API_KEY}`,
          'Content-Type': 'application/json'
        }
      });

      const contacts = hubspotResponse.data.results || [];
      
      // --- Write Contacts to Firestore using Batch ---

      if (contacts.length > 0) {
        const batch = db.batch();
        const clientsCollectionRef = db.collection('shops').doc(shopId).collection('clients');
        
        for (const contact of contacts) {
          const props = contact.properties;

          const clientData = {
            name: `${props.firstname || ''} ${props.lastname || ''}`.trim(),
            email: props.email || null,
            phone: props.phone || null,
            notes: props.notes || '',
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            hubspotId: contact.id 
          };

          if (clientData.email) {
            const docRef = clientsCollectionRef.doc(); 
            batch.set(docRef, clientData);
            importedCount++;
          }
        }

        await batch.commit();
      }

      // --- Success Response ---
      res.status(200).send({ 
        success: true, 
        count: importedCount,
        message: `Hubspot import successful. ${importedCount} client records saved to Firestore.` 
      });

    } catch (error) {
      console.error("Hubspot API or Firestore Batch Write Failed:", error);

      // Try to provide a helpful message for common API errors
      let errorMessage = error.message;
      if (error.response?.status === 401) {
          errorMessage = "Hubspot Authorization Failed. Check your API key.";
      }
      
      res.status(500).send({ 
        success: false, 
        error: "Hubspot Integration Error", 
        details: errorMessage,
        importedCount: importedCount 
      });
    }
  });
});