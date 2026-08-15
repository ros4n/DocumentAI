from rest_framework import serializers

from .models import ScanRecord, UserProfile


class CustomFieldSerializer(serializers.Serializer):
    label = serializers.CharField(required=False, allow_blank=True, default='')
    value = serializers.CharField(required=False, allow_blank=True, default='')

    def validate(self, attrs):
        label = (attrs.get('label') or '').strip()
        value = (attrs.get('value') or '').strip()
        if label or value:
            attrs['label'] = label
            attrs['value'] = value
        return attrs


class ProfileSerializer(serializers.ModelSerializer):
    custom_fields = CustomFieldSerializer(many=True, required=False)

    class Meta:
        model = UserProfile
        fields = [
            'full_name', 'first_name', 'last_name', 'email', 'phone', 'dob',
            'address', 'city', 'state', 'zip', 'country', 'employer',
            'occupation', 'gender', 'marital_status', 'nationality',
            'id_number', 'custom_fields', 'updated_at',
        ]
        read_only_fields = ['updated_at']

    def validate_custom_fields(self, value):
        cleaned = []
        seen = set()
        for item in value:
            if not isinstance(item, dict):
                continue
            label = str(item.get('label') or '').strip()[:100]
            field_value = str(item.get('value') or '').strip()[:300]
            if not label or not field_value:
                continue
            key = label.lower()
            if key in seen:
                continue
            seen.add(key)
            cleaned.append({'label': label, 'value': field_value})
        return cleaned[:50]


class ScanRecordSerializer(serializers.ModelSerializer):
    class Meta:
        model = ScanRecord
        fields = [
            'id', 'created_at', 'name', 'scan_type', 'source', 'preview_image',
            'ocr_text', 'ocr_engine', 'pages', 'filled_image', 'filled_at',
        ]
        read_only_fields = ['id', 'created_at', 'filled_at']
