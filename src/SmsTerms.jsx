import LegalPage from './LegalPage'
import { SMS_CONSENT_VERSION } from './smsConsent'

export default function SmsTerms() {
  return (
    <LegalPage title="SMS Terms" updated={SMS_CONSENT_VERSION}>
      <h3>What this is</h3>
      <p>
        Paddy's Pastures operates an SMS notification program for the boarders,
        staff, and management of our boarding facility. Staff and management
        receive alerts when a boarder sends a message through the Paddy's
        Pastures web portal. Each alert names the boarder and includes a link to
        view and reply to the message. Boarders may receive notifications about
        their horse's care and messages from the barn.
      </p>

      <h3>How you sign up</h3>
      <p>
        You opt in by checking the SMS notification box and providing your mobile
        number during account setup in the Paddy's Pastures web portal, or by
        asking barn management to enable it for you. Consent is not a condition
        of boarding at Paddy's Pastures or of using the web portal.
      </p>

      <h3>How often we text</h3>
      <p>Message frequency varies based on activity at the barn.</p>

      <h3>Cost</h3>
      <p>
        Message and data rates may apply. Paddy's Pastures does not charge for
        these messages; your mobile carrier may.
      </p>

      <h3>Stopping messages</h3>
      <p>
        Reply STOP to any message to stop receiving them. You will get one
        confirmation and then nothing further. You can also turn SMS
        notifications off in your account settings, or ask barn management to
        turn them off. Reply START to resume.
      </p>

      <h3>Getting help</h3>
      <p>
        Reply HELP to any message, or contact us at (941) 442-5648 or{' '}
        <a href="mailto:Howdy@paddyspastures.com">Howdy@paddyspastures.com</a>.
      </p>

      <h3>Carriers</h3>
      <p>Mobile carriers are not liable for delayed or undelivered messages.</p>

      <h3>Supported carriers</h3>
      <p>
        Carrier support may change and we cannot guarantee delivery on every
        carrier.
      </p>

      <h3>Your number</h3>
      <p>
        You must be the account holder or have the account holder's permission to
        sign this number up. Tell us if your number changes or transfers to
        someone else.
      </p>

      <h3>Privacy</h3>
      <p>
        We use your mobile number only to send the notifications described above.
        We do not sell or share it for marketing. See our{' '}
        <a href="/privacy">Privacy Policy</a>.
      </p>
    </LegalPage>
  )
}