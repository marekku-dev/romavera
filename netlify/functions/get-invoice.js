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
  const publicKey = process.env[`STRIPE_PK_${envKey}`];

  if (!secretKey) {
    throw new Error(`Unknown account: "${account}". Make sure STRIPE_SK_${envKey} is set in Netlify environment variables.`);
  }

  return { stripe: Stripe(secretKey), publicKey };
}

exports.handler = async (event, context) => {
  console.log('Getting invoice:', event.queryStringParameters);

  const invoiceId = event.queryStringParameters?.id;
  const account = event.queryStringParameters?.account;

  if (!invoiceId) {
    return {
      statusCode: 400,
      headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Invoice ID required' })
    };
  }

  if (!account) {
    return {
      statusCode: 400,
      headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'account parameter required' })
    };
  }

  try {
    const { stripe, publicKey } = getStripeClient(account);

    const invoice = await stripe.invoices.retrieve(invoiceId);
    console.log('Invoice retrieved:', invoice.id);

    const items = await Promise.all(
      invoice.lines.data.reverse()
        .filter(line => line.pricing?.price_details?.product)
        .map(async line => {
          const productId = line.pricing.price_details.product;
          const product = await stripe.products.retrieve(productId);
          return {
            id: product.id,
            name: product.name || line.description || 'Unnamed item',
            description: product.description || '',
            price: line.amount / 100,
            currency: line.currency,
            quantity: line.quantity,
            isBase: line.metadata?.isBase === 'true'
          };
        })
    );

    if (items.length === 0) {
      console.warn('No valid items found in invoice.');
    }

    console.log('Parsed items:', items);

    return {
      statusCode: 200,
      headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' },
      body: JSON.stringify({
        invoiceId: invoice.id,
        customerEmail: invoice.customer_email,
        customerName: invoice.customer_name,
        description: invoice.description,
        items,
        totalAmount: invoice.total / 100,
        stripePublicKey: publicKey
      })
    };

  } catch (error) {
    console.error('Error retrieving invoice:', error);
    return {
      statusCode: error.statusCode || 500,
      headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: error.message })
    };
  }
};
