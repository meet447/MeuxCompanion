def contains_wh_words(message):
    wh_words = ['what', 'meux']
    message_lower = message.lower()
    for word in wh_words:
        if word in message_lower:
            return True
    return False