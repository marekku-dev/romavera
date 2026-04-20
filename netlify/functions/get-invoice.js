const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

exports.handler = async (event, context) => {
  console.log('Getting invoice:', event.queryStringParameters);
  const invoiceId = event.queryStringParameters?.id;

  if (!invoiceId) {
    return {
      statusCode: 400,
      headers: {
        'Access-Control-Allow-Origin': 'https://www.romaverafilms.com',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ error: 'Invoice ID required' })
    };
  }

  try {
    const invoice = await stripe.invoices.retrieve(invoiceId);

    console.log('Invoice retrieved:', invoice.id);
    console.log('Raw lines:', JSON.stringify(invoice.lines.data, null, 2));

    const items = await Promise.all(
      invoice.lines.data
        .filter(line => line.price?.product)
        .map(async line => {
          const product = await stripe.products.retrieve(line.price.product);
          return {
            id: product.id,
            name: product.name || line.description || 'Unnamed item',
            description: product.description || '',
            price: line.price.unit_amount / 100,
            currency: line.price.currency,
            quantity: line.quantity,
            isBase: line.metadata?.isBase === 'true'
          };
        })
    );

    if (items.length === 0) {
      console.warn('No valid items found in invoice. Raw lines logged above.');
    }

    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': 'https://www.romaverafilms.com',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        invoiceId: invoice.id,
        customerEmail: invoice.customer_email,
        customerName: invoice.customer_name,
        description: invoice.description,
        items: items,
        totalAmount: invoice.total / 100
      })
    };

  } catch (error) {
    console.error('Error retrieving invoice:', error);
    return {
      statusCode: error.statusCode || 500,
      headers: {
        'Access-Control-Allow-Origin': 'https://www.romaverafilms.com',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ error: error.message })
    };
  }
};