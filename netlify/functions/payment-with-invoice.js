const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

exports.handler = async (event, context) => {
  // Логируем для отладки
  console.log('Event:', event);
  console.log('STRIPE_SECRET_KEY exists:', !!process.env.STRIPE_SECRET_KEY);

  // Обработка preflight запросов (OPTIONS)
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': 'https://www.romaverafilms.com',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ ok: true })
    };
  }

  // Только POST
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: {
        'Access-Control-Allow-Origin': 'https://www.romaverafilms.com',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  try {
    // Парсим тело запроса
    let body;
    try {
      body = JSON.parse(event.body);
    } catch (e) {
      return {
        statusCode: 400,
        headers: {
          'Access-Control-Allow-Origin': 'https://www.romaverafilms.com',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ error: 'Invalid JSON in request body' })
      };
    }

    const { name, wedding_date, selected_upsells, total_amount } = body;

    console.log('Request data:', { name, wedding_date, selected_upsells, total_amount });

    // Проверяем обязательные данные
    if (!selected_upsells || !Array.isArray(selected_upsells)) {
      return {
        statusCode: 400,
        headers: {
          'Access-Control-Allow-Origin': 'https://www.romaverafilms.com',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ error: 'selected_upsells must be an array' })
      };
    }

    // Базовый пункт (всегда есть)
    const lineItems = [
      {
        price_data: {
          currency: 'eur',
          product_data: {
            name: 'Wedding filming',
            description: 'Professional wedding videography'
          },
          unit_amount: 3500 * 100 // в центах
        },
        quantity: 1
      }
    ];

    // Маппим апсейлы
    const upsellMap = {
      film: { 
        name: '16mm film', 
        price: 2500,
        description: 'Grain, warmth, and a look that digital can\'t replicate.'
      },
      priority: { 
        name: 'Priority edit', 
        price: 4000,
        description: 'Your film in 30 days.'
      },
      full: { 
        name: 'Full wedding film', 
        price: 5000,
        description: 'A wedding weekend holds more moments than memory can keep...'
      }
    };

    // Добавляем выбранные апсейлы
    selected_upsells.forEach(upsellId => {
      const upsell = upsellMap[upsellId];
      if (upsell) {
        lineItems.push({
          price_data: {
            currency: 'eur',
            product_data: {
              name: upsell.name,
              description: upsell.description
            },
            unit_amount: upsell.price * 100 // в центах
          },
          quantity: 1
        });
      }
    });

    console.log('Line items:', lineItems);

    // Определяем URL для редирект (используем переменную окружения или URL_ORIGIN)
    const baseUrl = process.env.URL || 'https://romaverafilms.netlify.app';

    // Создаём сессию в Stripe
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: lineItems,
      mode: 'payment',
      success_url: `${baseUrl}/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseUrl}/cancel`,
      customer_email: undefined,
      metadata: {
        client_name: name || 'Client',
        wedding_date: wedding_date || '',
        selected_upsells: selected_upsells.join(',') || ''
      }
    });

    console.log('Session created:', session.id);

    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': 'https://www.romaverafilms.com',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ 
        sessionId: session.id,
        message: 'Checkout session created successfully'
      })
    };

  } catch (error) {
    console.error('Error creating checkout session:', error);
    console.error('Error message:', error.message);
    console.error('Error type:', error.type);

    return {
      statusCode: 500,
      headers: {
        'Access-Control-Allow-Origin': 'https://www.romaverafilms.com',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ 
        error: error.message || 'Internal server error',
        type: error.type || 'Unknown error'
      })
    };
  }
};