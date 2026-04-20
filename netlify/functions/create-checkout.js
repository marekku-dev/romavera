const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

exports.handler = async (event, context) => {
  // Обработка preflight запросов
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS'
      },
      body: ''
    };
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  try {
    const { name, wedding_date, selected_upsells, total_amount } = JSON.parse(event.body);

    // Линейные айтемы для чекаута
    const lineItems = [
      {
        price_data: {
          currency: 'eur',
          product_data: {
            name: 'Wedding filming',
          },
          unit_amount: 3500 * 100, // в центах
        },
        quantity: 1,
      }
    ];

    // Маппим апсейлы на линейные айтемы
    const upsellMap = {
      film: { name: '16mm film', price: 2500 },
      priority: { name: 'Priority edit', price: 4000 },
      full: { name: 'Full wedding film', price: 5000 }
    };

    selected_upsells.forEach(upsellId => {
      const upsell = upsellMap[upsellId];
      if (upsell) {
        lineItems.push({
          price_data: {
            currency: 'eur',
            product_data: {
              name: upsell.name,
            },
            unit_amount: upsell.price * 100, // в центах
          },
          quantity: 1,
        });
      }
    });

    // Создаём сессию
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: lineItems,
      mode: 'payment',
      success_url: `${process.env.URL}/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.URL}/cancel`,
      metadata: {
        client_name: name,
        wedding_date: wedding_date,
        selected_upsells: selected_upsells.join(',')
      }
    });

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
    console.error('Stripe error:', error);
    return {
      statusCode: 500,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ error: error.message })
    };
  }
};