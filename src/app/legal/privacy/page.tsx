/*
 * DRAFT: NOT LEGAL ADVICE. This privacy policy is a working draft written from what the code
 * does. Have a lawyer review it before launch (and whenever ads, purchases, analytics, crash
 * reporting or accounts change).
 *
 * Placeholders to fill in before publishing:
 *   [COMPANY NAME]   the legal entity that publishes the app
 *   [CONTACT EMAIL]  a monitored address for privacy requests
 *   [JURISDICTION]   the governing law / where the company is established
 *
 * Keep it in sync with the App Store privacy labels and the Google Play data safety form
 * (see README, "Privacy and store disclosures").
 */
import type { Metadata } from "next";
import { Ext, LegalPage, List, Section } from "../legal-page";

export const metadata: Metadata = { title: "Privacy policy" };

export default function PrivacyPage() {
  return (
    <LegalPage
      title="Privacy policy"
      updated="[DATE]"
      intro={
        <>
          <p>
            Inferno is a poker and blackjack training app made by [COMPANY NAME] (&ldquo;we&rdquo;). You don&rsquo;t need an account, and we
            don&rsquo;t run servers that store information about you. Your progress stays on your device.
          </p>
          <p className="mt-3">
            The free version shows ads from Google AdMob, and memberships are sold through Apple and Google. Those companies collect some data,
            described below.
          </p>
        </>
      }
    >
      <Section title="What stays on your device">
        <p>The app saves the following in its local storage on your phone or browser. It is never sent to us:</p>
        <List>
          <li>your progress: ratings, hand and match history, drill answers, streaks, chip balance and lessons completed;</li>
          <li>your settings: display name, graphics quality, sound and haptics;</li>
          <li>whether you have an active membership (so it works offline);</li>
          <li>when ads were last shown, so we can limit how often you see them.</li>
        </List>
        <p>
          Deleting the app, clearing its data, or using <strong className="text-bone">Profile → Reset progress</strong> removes it. Because we
          don&rsquo;t keep a copy, we can&rsquo;t restore it for you either.
        </p>
      </Section>

      <Section title="Advertising (Google AdMob)">
        <p>
          In the iOS and Android apps, players without a membership see occasional full-screen ads at natural breaks, and anyone can choose to
          watch an ad for free chips. There are no ads on the website. Ads are provided by Google AdMob, which may collect:
        </p>
        <List>
          <li>
            your device&rsquo;s advertising identifier (the IDFA on iOS, only if you allow tracking; the Advertising ID on Android);
          </li>
          <li>your IP address, from which an approximate location can be inferred;</li>
          <li>device and app information, such as model, operating system, language and app version;</li>
          <li>how you interact with ads (views, taps, whether you finished a rewarded ad);</li>
          <li>diagnostic data about how the ads perform.</li>
        </List>
        <p>
          Google uses this to show and measure ads, prevent fraud and, where you allow it, personalize ads. Google is responsible for its own
          processing; see{" "}
          <Ext href="https://policies.google.com/technologies/partner-sites">how Google uses information from apps that use its services</Ext>{" "}
          and the <Ext href="https://policies.google.com/privacy">Google Privacy Policy</Ext>.
        </p>
      </Section>

      <Section title="Your ad choices">
        <List>
          <li>
            <strong className="text-bone">EEA, UK and Switzerland:</strong> before any ads are requested, the app shows Google&rsquo;s consent
            message so you can accept or refuse personalized ads and related data use. You can change your choice any time in{" "}
            <strong className="text-bone">Profile → Privacy choices</strong>. Some US states get a similar choice.
          </li>
          <li>
            <strong className="text-bone">iPhone and iPad:</strong> the app asks for permission to track (App Tracking Transparency) before it
            first loads ads, never on first launch. If you say no, the advertising identifier isn&rsquo;t shared and ads aren&rsquo;t personalized
            with it. You can change this in Settings → Privacy &amp; Security → Tracking.
          </li>
          <li>
            <strong className="text-bone">Android:</strong> you can reset or delete your Advertising ID in your device&rsquo;s settings (Settings →
            Privacy → Ads, or Settings → Google → Ads, depending on the device).
          </li>
          <li>
            <strong className="text-bone">Members</strong> never see ads they didn&rsquo;t ask for. A member who chooses to watch an ad for chips
            is shown one, with the same data use as above.
          </li>
        </List>
      </Section>

      <Section title="Purchases and memberships">
        <p>
          Memberships are bought through the Apple App Store or Google Play. Apple and Google handle payment, so we never see your card details
          or billing address. Their privacy policies apply to the purchase.
        </p>
        <p>
          To check whether a membership is active, the app uses RevenueCat, a subscription service. RevenueCat receives an anonymous app user ID
          created on your device, your purchase receipts and transaction history (product, price, dates, renewals, refunds), and basic device
          information such as platform and app version. It doesn&rsquo;t receive your name or email from us. See the{" "}
          <Ext href="https://www.revenuecat.com/privacy">RevenueCat privacy policy</Ext>.
        </p>
      </Section>

      <Section title="The website">
        <p>
          If you use Inferno in a browser, your progress is stored in that browser in the same way. Our hosting provider receives standard
          request information (such as IP address and browser type) to deliver the pages and protect against abuse. The website has no ads and
          no purchases.
        </p>
      </Section>

      <Section title="What we don't do">
        <List>
          <li>We don&rsquo;t require or offer accounts, and we don&rsquo;t ask for your name, email or phone number.</li>
          <li>We don&rsquo;t sell your personal information.</li>
          <li>We don&rsquo;t use analytics or crash-reporting services of our own.</li>
          <li>We don&rsquo;t knowingly collect information from anyone under 18.</li>
        </List>
        <p>
          Under some US state laws, letting an ad network show personalized ads can count as &ldquo;sharing&rdquo; personal information or
          &ldquo;targeted advertising&rdquo;. You can opt out with the choices above: deny tracking on iOS, delete or reset your Advertising ID on
          Android, or use Privacy choices where it&rsquo;s offered.
        </p>
      </Section>

      <Section title="Children">
        <p>
          Inferno simulates casino games and is rated 17+ on the App Store. It is meant for adults aged 18 and over and is not directed at
          children. If you believe a child has used the app and data about them was collected through an ad or purchase, contact us and
          we&rsquo;ll help get it removed.
        </p>
      </Section>

      <Section title="Your rights">
        <p>
          Depending on where you live (for example under the GDPR, UK GDPR or US state privacy laws), you may have the right to access, correct,
          delete or object to the use of your personal data, and to complain to your local data protection authority. Since we don&rsquo;t hold
          data about you on our own systems, most requests are best handled by deleting the app&rsquo;s data on your device, using your ad
          choices above, or contacting Google, Apple, Google Play or RevenueCat. We&rsquo;re happy to help: email [CONTACT EMAIL].
        </p>
        <p>
          Where the GDPR applies, the legal basis for ads is your consent (personalized ads) or our legitimate interest in funding a free app
          (non-personalized ads and fraud prevention). For memberships it is the performance of our contract with you.
        </p>
      </Section>

      <Section title="Changes">
        <p>
          If we change how the app handles data, for example by adding accounts or cloud sync, we will update this policy and the date at the
          top, and tell you in the app when the change is significant.
        </p>
      </Section>

      <Section title="Contact">
        <p>
          [COMPANY NAME], [JURISDICTION]. Email: [CONTACT EMAIL].
        </p>
      </Section>
    </LegalPage>
  );
}
