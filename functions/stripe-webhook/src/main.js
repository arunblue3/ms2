const sdk = require('node-appwrite');

// Initialize Appwrite SDK
const client = new sdk.Client()
  .setEndpoint(process.env.APPWRITE_FUNCTION_ENDPOINT)
  .setProject(process.env.APPWRITE_FUNCTION_PROJECT_ID)
  .setKey(process.env.APPWRITE_API_KEY);

const databases = new sdk.Databases(client);

// Initialize Stripe
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

module.exports = async ({ req, res, log, error }) => {
  try {
    // Handle CORS
    if (req.method === 'OPTIONS') {
      return res.json({}, 200, {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, Stripe-Signature',
      });
    }

    if (req.method !== 'POST') {
      return res.json({ error: 'Method not allowed' }, 405);
    }

    // Get the signature from headers
    const signature = req.headers['stripe-signature'];
    if (!signature) {
      error('No Stripe signature found');
      return res.json({ error: 'No signature found' }, 400);
    }

    // Verify webhook signature
    let event;
    try {
      event = stripe.webhooks.constructEvent(
        req.bodyRaw, // Use raw body for signature verification
        signature,
        process.env.STRIPE_WEBHOOK_SECRET
      );
    } catch (err) {
      error('Webhook signature verification failed:', err.message);
      return res.json({ error: 'Webhook signature verification failed' }, 400);
    }

    log('Received Stripe webhook event:', event.type);

    // Handle the event
    switch (event.type) {
      case 'payment_intent.succeeded':
        await handlePaymentSucceeded(event.data.object, log, error);
        break;
      
      case 'payment_intent.payment_failed':
        await handlePaymentFailed(event.data.object, log, error);
        break;
      
      case 'payment_intent.canceled':
        await handlePaymentCanceled(event.data.object, log, error);
        break;
      
      default:
        log('Unhandled event type:', event.type);
    }

    return res.json({ received: true }, 200, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, Stripe-Signature',
    });

  } catch (err) {
    error('Webhook processing error:', err);
    return res.json({ 
      error: 'Webhook processing failed',
      details: err.message 
    }, 500, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, Stripe-Signature',
    });
  }
};

async function handlePaymentSucceeded(paymentIntent, log, error) {
  try {
    log('Processing successful payment:', paymentIntent.id);
    
    // Update payment record in database
    const { documents } = await databases.listDocuments(
      process.env.APPWRITE_DATABASE_ID,
      process.env.APPWRITE_PAYMENTS_COLLECTION_ID,
      [
        sdk.Query.equal('paymentIntentId', paymentIntent.id)
      ]
    );

    if (documents.length === 0) {
      error('Payment record not found for PaymentIntent:', paymentIntent.id);
      return;
    }

    const paymentRecord = documents[0];

    // Update payment status to succeeded
    await databases.updateDocument(
      process.env.APPWRITE_DATABASE_ID,
      process.env.APPWRITE_PAYMENTS_COLLECTION_ID,
      paymentRecord.$id,
      {
        status: 'succeeded',
        completedAt: new Date().toISOString(),
        stripePaymentData: JSON.stringify({
          amount_received: paymentIntent.amount_received,
          charges: paymentIntent.charges,
          receipt_email: paymentIntent.receipt_email
        })
      }
    );

    // Create transaction record
    await databases.createDocument(
      process.env.APPWRITE_DATABASE_ID,
      process.env.APPWRITE_TRANSACTIONS_COLLECTION_ID,
      sdk.ID.unique(),
      {
        paymentId: paymentRecord.$id,
        serviceId: paymentRecord.serviceId,
        buyerId: paymentRecord.buyerId,
        sellerId: paymentRecord.sellerId,
        amount: paymentRecord.amount,
        currency: paymentRecord.currency,
        type: 'service_payment',
        status: 'completed',
        paymentMethod: 'stripe',
        transactionDate: new Date().toISOString(),
        metadata: JSON.stringify({
          paymentIntentId: paymentIntent.id,
          stripeCustomerId: paymentIntent.customer
        })
      }
    );

    log('Successfully processed payment:', paymentIntent.id);

  } catch (err) {
    error('Error handling payment success:', err);
    throw err;
  }
}

async function handlePaymentFailed(paymentIntent, log, error) {
  try {
    log('Processing failed payment:', paymentIntent.id);
    
    // Update payment record in database
    const { documents } = await databases.listDocuments(
      process.env.APPWRITE_DATABASE_ID,
      process.env.APPWRITE_PAYMENTS_COLLECTION_ID,
      [
        sdk.Query.equal('paymentIntentId', paymentIntent.id)
      ]
    );

    if (documents.length === 0) {
      error('Payment record not found for PaymentIntent:', paymentIntent.id);
      return;
    }

    const paymentRecord = documents[0];

    await databases.updateDocument(
      process.env.APPWRITE_DATABASE_ID,
      process.env.APPWRITE_PAYMENTS_COLLECTION_ID,
      paymentRecord.$id,
      {
        status: 'failed',
        failedAt: new Date().toISOString(),
        failureReason: paymentIntent.last_payment_error?.message || 'Payment failed'
      }
    );

    log('Updated payment record for failed payment:', paymentIntent.id);

  } catch (err) {
    error('Error handling payment failure:', err);
    throw err;
  }
}

async function handlePaymentCanceled(paymentIntent, log, error) {
  try {
    log('Processing canceled payment:', paymentIntent.id);
    
    // Update payment record in database
    const { documents } = await databases.listDocuments(
      process.env.APPWRITE_DATABASE_ID,
      process.env.APPWRITE_PAYMENTS_COLLECTION_ID,
      [
        sdk.Query.equal('paymentIntentId', paymentIntent.id)
      ]
    );

    if (documents.length === 0) {
      error('Payment record not found for PaymentIntent:', paymentIntent.id);
      return;
    }

    const paymentRecord = documents[0];

    await databases.updateDocument(
      process.env.APPWRITE_DATABASE_ID,
      process.env.APPWRITE_PAYMENTS_COLLECTION_ID,
      paymentRecord.$id,
      {
        status: 'canceled',
        canceledAt: new Date().toISOString()
      }
    );

    log('Updated payment record for canceled payment:', paymentIntent.id);

  } catch (err) {
    error('Error handling payment cancellation:', err);
    throw err;
  }
}