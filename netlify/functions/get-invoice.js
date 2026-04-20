const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

exports.handler = async (event, context) => {
  // Логируем для отладки
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
    // Получаем инвойс с развёрнутыми товарами
    const invoice = await stripe.invoices.retrieve(invoiceId, {
      expand: ['lines.data.price.product']
    });

    console.log('Invoice retrieved:', invoice.id);
    console.log('Invoice lines:', invoice.lines.data);

    // Парсим товары из инвойса
    const items = invoice.lines.data.map(line => ({
      id: line.price.product.id,
      name: line.price.product.name,
      description: line.price.product.description,
      price: line.price.unit_amount / 100, // конвертируем из центов в евро
      currency: line.price.currency,
      quantity: line.quantity,
      isBase: line.metadata?.isBase === 'true' // если в метаданных отмечено как базовое
    }));

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
        totalAmount: invoice.total / 100 // в евро
      })
    };
  } catch (error) {
    console.error('Error retrieving invoice:', error);
    return {
      statusCode: 404,
      headers: {
        'Access-Control-Allow-Origin': 'https://www.romaverafilms.com',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ error: error.message })
    };
  }
};