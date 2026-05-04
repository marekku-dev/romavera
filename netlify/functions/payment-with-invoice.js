const Stripe = require('stripe');

// Маппинг значений из Webflow CMS → ключ env-переменной
const ACCOUNT_ALIASES = {
  'SL (Europe)': 'SL_EUROPE',
  'LLC (America)': 'LLC_AMERICA',
};

function getStripeClient(account) {
  if (!account) {
    throw new Error('account parameter is required');
  }

  const envKey = ACCOUNT_ALIASES[account] || account.toUpperCase().replace(/[^A-Z0-9]/g, '_');
  const secretKey = process.env[`STRIPE_SK_${envKey}`];

  if (!secretKey) {
    throw new Error(`Unknown account: "${account}". Make sure STRIPE_SK_${envKey} is set in Netlify environment variables.`);
  }

  return Stripe(secretKey);
}

exports.handler = async (event, context) => {
  console.log('STRIPE_SECRET_KEY exists:', !!process.env.STRIPE_SECRET_KEY);

  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ ok: true })
    };
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  try {
    let body;
    try {
      body = JSON.parse(event.body);
    } catch (e) {
      return {
        statusCode: 400,
        headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Invalid JSON in request body' })
      };
    }

    const { invoice_id, account, selected_upsells } = body;

    console.log('Request data:', { invoice_id, account, selected_upsells });

    if (!invoice_id) {
      return {
        statusCode: 400,
        headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'invoice_id is required' })
      };
    }

    if (!account) {
      return {
        statusCode: 400,
        headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'account is required' })
      };
    }

    if (!selected_upsells || !Array.isArray(selected_upsells)) {
      return {
        statusCode: 400,
        headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'selected_upsells must be an array' })
      };
    }

    const stripe = getStripeClient(account);

    const invoice = await stripe.invoices.retrieve(invoice_id);

    const invoiceItems = await Promise.all(
      invoice.lines.data
        .filter(line => line.pricing?.price_details?.product)
        .map(async line => {
          const product = await stripe.products.retrieve(line.pricing.price_details.product);
          return {
            productId: product.id,
            name: product.name,
            description: product.description || '',
            amount: line.amount,
            currency: line.currency
          };
        })
    );

    console.log('Invoice items:', invoiceItems);

    // Stripe возвращает строки в обратном порядке — последний добавленный идёт первым
    // Поэтому базовый товар (добавленный первым) — последний в массиве
    const baseItem = invoiceItems[invoiceItems.length - 1];
    const selectedItems = invoiceItems.slice(0, -1).filter(item =>
      selected_upsells.includes(item.productId)
    );

    const lineItems = [baseItem, ...selectedItems].map(item => ({
      price_data: {
        currency: item.currency,
        product_data: {
          name: item.name,
          ...(item.description && { description: item.description })
        },
        unit_amount: item.amount
      },
      quantity: 1
    }));

    console.log('Line items for Stripe:', lineItems);

    const baseUrl = process.env.SITE_URL || 'https://www.romaverafilms.com';

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: lineItems,
      mode: 'payment',
      success_url: `${baseUrl}/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseUrl}/cancel`,
      metadata: {
        invoice_id,
        account,
        client_name: invoice.customer_name || 'Client',
        selected_upsells: selected_upsells.join(',')
      }
    });

    console.log('Session created:', session.id);

    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ sessionId: session.id })
    };

  } catch (error) {
    console.error('Error:', error.message);
    return {
      statusCode: error.statusCode || 500,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ error: error.message })
    };
  }
};
