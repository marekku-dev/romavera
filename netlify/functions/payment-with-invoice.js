const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

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

    const { invoice_id, selected_upsells } = body;

    console.log('Request data:', { invoice_id, selected_upsells });

    if (!invoice_id) {
      return {
        statusCode: 400,
        headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'invoice_id is required' })
      };
    }

    if (!selected_upsells || !Array.isArray(selected_upsells)) {
      return {
        statusCode: 400,
        headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'selected_upsells must be an array' })
      };
    }

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
            currency: line.currency,
            isBase: line.metadata?.isBase === 'true'
          };
        })
    );

    console.log('Invoice items:', invoiceItems);

    const baseItem = invoiceItems.find(item => item.isBase);
    const selectedItems = invoiceItems.filter(item =>
      !item.isBase && selected_upsells.includes(item.productId)
    );

    if (!baseItem) {
      return {
        statusCode: 400,
        headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'No base item found in invoice. Make sure one line item has metadata isBase=true in Stripe.' })
      };
    }

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

    const baseUrl = process.env.URL || 'https://romaverafilms.netlify.app';

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: lineItems,
      mode: 'payment',
      success_url: `${baseUrl}/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseUrl}/cancel`,
      metadata: {
        invoice_id: invoice_id,
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