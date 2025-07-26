const sdk = require('node-appwrite');

// Initialize Appwrite SDK
const client = new sdk.Client()
  .setEndpoint(process.env.APPWRITE_FUNCTION_ENDPOINT)
  .setProject(process.env.APPWRITE_FUNCTION_PROJECT_ID)
  .setKey(process.env.APPWRITE_API_KEY);

const databases = new sdk.Databases(client);
const users = new sdk.Users(client);

// Initialize Stripe
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

module.exports = async ({ req, res, log, error }) => {
  try {
    // Handle CORS
    if (req.method === 'OPTIONS') {
      return res.json({}, 200, {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      });
    }

    if (req.method !== 'POST') {
      return res.json({ error: 'Method not allowed' }, 405);
    }

    // Verify authentication
    const authHeader = req.headers['authorization'];
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.json({ error: 'Authorization required' }, 401);
    }

    const jwt = authHeader.substring(7);
    
    // Verify JWT and get user
    let userId;
    try {
      const jwtPayload = sdk.JWT.decode(jwt);
      userId = jwtPayload.userId;
    } catch (jwtError) {
      error('JWT verification failed:', jwtError);
      return res.json({ error: 'Invalid authentication token' }, 401);
    }

    // Get user details
    const user = await users.get(userId);
    log('Processing payment for user:', user.email);

    // Parse request body
    const { serviceId, amount, currency = 'sgd', description } = req.body;

    if (!serviceId || !amount) {
      return res.json({ error: 'Service ID and amount are required' }, 400);
    }

    // Fetch service details from database
    const service = await databases.getDocument(
      process.env.APPWRITE_DATABASE_ID,
      process.env.APPWRITE_SERVICES_COLLECTION_ID,
      serviceId
    );

    if (!service) {
      return res.json({ error: 'Service not found' }, 404);
    }

    // Create or get Stripe customer
    let stripeCustomer;
    try {
      // Try to find existing customer by email
      const existingCustomers = await stripe.customers.list({
        email: user.email,
        limit: 1
      });

      if (existingCustomers.data.length > 0) {
        stripeCustomer = existingCustomers.data[0];
        log('Found existing Stripe customer:', stripeCustomer.id);
      } else {
        // Create new customer
        stripeCustomer = await stripe.customers.create({
          email: user.email,
          name: user.name || user.email.split('@')[0],
          metadata: {
            appwrite_user_id: userId,
            service_id: serviceId
          }
        });
        log('Created new Stripe customer:', stripeCustomer.id);
      }
    } catch (stripeError) {
      error('Stripe customer error:', stripeError);
      return res.json({ error: 'Failed to create customer' }, 500);
    }

    // Create PaymentIntent
    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(amount * 100), // Convert to cents
      currency: currency.toLowerCase(),
      customer: stripeCustomer.id,
      description: description || `Payment for ${service.title}`,
      metadata: {
        service_id: serviceId,
        service_title: service.title,
        buyer_id: userId,
        seller_id: service.userId,
        appwrite_function: 'stripe-payment'
      },
      automatic_payment_methods: {
        enabled: true,
      },
    });

    log('Created PaymentIntent:', paymentIntent.id);

    // Store payment record in Appwrite database
    const paymentRecord = await databases.createDocument(
      process.env.APPWRITE_DATABASE_ID,
      process.env.APPWRITE_PAYMENTS_COLLECTION_ID,
      sdk.ID.unique(),
      {
        paymentIntentId: paymentIntent.id,
        serviceId: serviceId,
        buyerId: userId,
        sellerId: service.userId,
        amount: amount,
        currency: currency,
        status: 'pending',
        stripeCustomerId: stripeCustomer.id,
        description: description || `Payment for ${service.title}`,
        createdAt: new Date().toISOString()
      }
    );

    log('Created payment record:', paymentRecord.$id);

    return res.json({
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id,
      paymentRecordId: paymentRecord.$id
    }, 200, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    });

  } catch (err) {
    error('Payment function error:', err);
    return res.json({ 
      error: 'Internal server error',
      details: err.message 
    }, 500, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    });
  }
};