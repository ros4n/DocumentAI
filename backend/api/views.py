import logging
from datetime import datetime

from django.contrib.auth import authenticate
from django.contrib.auth.models import User
from django.db import connection
from django.db.models import Q
from django.utils import timezone
from rest_framework import status
from rest_framework.authtoken.models import Token
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from .models import ScanRecord, UserProfile
from .ocr import MAX_FILE_SIZE, recognize_image, recognize_pdf
from .serializers import ProfileSerializer, ScanRecordSerializer
from .field_detect import (
    MAX_FILE_SIZE as DETECT_MAX_FILE_SIZE,
    FieldDetectionError,
    detect_fields_in_image,
    vlm_configured,
)


def seed_profile(user, name=''):
    try:
        profile = user.profile
    except UserProfile.DoesNotExist:
        profile = UserProfile(user=user)
    if name and not profile.full_name:
        parts = name.split()
        profile.full_name = name
        profile.first_name = parts[0] if parts else ''
        profile.last_name = ' '.join(parts[1:]) if len(parts) > 1 else ''
    profile.save()
    return profile


@api_view(['GET'])
def health(request):
    db_ok = True
    try:
        with connection.cursor() as cursor:
            cursor.execute('SELECT 1')
            cursor.fetchone()
    except Exception:
        db_ok = False
    return Response({'status': 'ok', 'database': 'connected' if db_ok else 'unavailable'})


@api_view(['POST'])
def register(request):
    email = (request.data.get('email') or '').strip().lower()
    password = request.data.get('password') or ''
    name = (request.data.get('name') or '').strip()

    if not email or not password:
        return Response(
            {'error': 'Email and password are required.'},
            status=status.HTTP_400_BAD_REQUEST,
        )
    if len(password) < 6:
        return Response(
            {'error': 'Password must be at least 6 characters.'},
            status=status.HTTP_400_BAD_REQUEST,
        )
    if User.objects.filter(username=email).exists():
        return Response(
            {'error': 'An account with this email already exists.'},
            status=status.HTTP_400_BAD_REQUEST,
        )

    user = User.objects.create_user(
        username=email,
        email=email,
        password=password,
        first_name=name,
    )
    seed_profile(user, name)
    token, _ = Token.objects.get_or_create(user=user)
    return Response(
        {
            'token': token.key,
            'user': {
                'id': user.id,
                'email': user.email,
                'name': user.first_name,
            },
        },
        status=status.HTTP_201_CREATED,
    )


@api_view(['POST'])
def login(request):
    email = (request.data.get('email') or '').strip().lower()
    password = request.data.get('password') or ''
    user = authenticate(username=email, password=password)
    if not user:
        return Response(
            {'error': 'Invalid email or password.'},
            status=status.HTTP_400_BAD_REQUEST,
        )
    token, _ = Token.objects.get_or_create(user=user)
    return Response(
        {
            'token': token.key,
            'user': {
                'id': user.id,
                'email': user.email,
                'name': user.first_name,
            },
        }
    )


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def me(request):
    return Response(
        {
            'id': request.user.id,
            'email': request.user.email,
            'name': request.user.first_name,
        }
    )


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def ocr(request):
    upload = request.FILES.get('file')
    if upload is None:
        return Response(
            {'error': 'A file is required.'},
            status=status.HTTP_400_BAD_REQUEST,
        )
    if upload.size > MAX_FILE_SIZE:
        return Response(
            {'error': 'File is too large (max 25 MB).'},
            status=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
        )

    name = (upload.name or '').lower()
    content_type = (upload.content_type or '').lower()
    is_pdf = content_type == 'application/pdf' or name.endswith('.pdf')
    is_image = content_type.startswith('image/')
    if not (is_pdf or is_image):
        return Response(
            {'error': 'Only images and PDFs are supported.'},
            status=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
        )

    data = upload.read()
    try:
        if is_pdf:
            pages = recognize_pdf(data)
            text = '\n\n'.join(
                f'--- PAGE {index + 1} ---\n{page}'
                for index, page in enumerate(pages)
            ).strip()
            return Response({'text': text, 'pages': len(pages), 'engine': 'rapidocr'})
        text = recognize_image(data)
        return Response({'text': text, 'pages': 1, 'engine': 'rapidocr'})
    except Exception as exc:
        logger.exception('OCR failed')
        return Response(
            {'error': f'OCR failed: {exc}'},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def detect_fields(request):
    """Tier-1 structured field detection (frontend falls back to on-device
    OpenCV automatically when this returns 503/5xx — same pattern as OCR)."""
    if not vlm_configured():
        return Response(
            {'error': 'Field detection backend is not configured.'},
            status=status.HTTP_503_SERVICE_UNAVAILABLE,
        )

    upload = request.FILES.get('image')
    if upload is None:
        return Response(
            {'error': 'An image file is required.'},
            status=status.HTTP_400_BAD_REQUEST,
        )
    if upload.size > DETECT_MAX_FILE_SIZE:
        return Response(
            {'error': 'File is too large (max 25 MB).'},
            status=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
        )
    content_type = (upload.content_type or '').lower()
    if not content_type.startswith('image/'):
        return Response(
            {'error': 'Only rasterized page images are supported (send PNG/JPEG).'},
            status=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
        )

    data = upload.read()
    try:
        result = detect_fields_in_image(data, content_type)
    except FieldDetectionError as exc:
        logger.warning('Field detection failed: %s', exc)
        return Response(
            {'error': f'Field detection failed: {exc}'},
            status=status.HTTP_502_BAD_GATEWAY,
        )
    except Exception:
        logger.exception('Unexpected field-detection error')
        return Response(
            {'error': 'Field detection failed unexpectedly.'},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )
    return Response(result)


@api_view(['GET', 'PUT'])
@permission_classes([IsAuthenticated])
def profile(request):
    profile_obj = seed_profile(request.user)
    if request.method == 'GET':
        serializer = ProfileSerializer(profile_obj)
        return Response(serializer.data)

    serializer = ProfileSerializer(profile_obj, data=request.data, partial=True)
    serializer.is_valid(raise_exception=True)
    serializer.save()
    return Response(serializer.data)


@api_view(['GET', 'POST'])
@permission_classes([IsAuthenticated])
def scans(request):
    if request.method == 'POST':
        serializer = ScanRecordSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = dict(serializer.validated_data)
        if 'filled_image' in data:
            data['filled_at'] = timezone.now()
        serializer.save(user=request.user, **data)
        return Response(serializer.data, status=status.HTTP_201_CREATED)

    queryset = ScanRecord.objects.filter(user=request.user)
    search = (request.query_params.get('search') or '').strip()
    scan_type = (request.query_params.get('type') or '').strip()
    filled = (request.query_params.get('status') or '').strip()

    if search:
        queryset = queryset.filter(
            Q(ocr_text__icontains=search)
            | Q(source__icontains=search)
            | Q(name__icontains=search)
        )
    if scan_type in ('image', 'pdf'):
        queryset = queryset.filter(scan_type=scan_type)
    if filled == 'filled':
        queryset = queryset.filter(filled_at__isnull=False)
    elif filled == 'ocr':
        queryset = queryset.filter(filled_at__isnull=True)

    serializer = ScanRecordSerializer(queryset, many=True)
    return Response(serializer.data)


@api_view(['GET', 'PATCH', 'DELETE'])
@permission_classes([IsAuthenticated])
def scan_detail(request, scan_id):
    try:
        record = ScanRecord.objects.get(id=scan_id, user=request.user)
    except ScanRecord.DoesNotExist:
        return Response({'error': 'Scan not found.'}, status=status.HTTP_404_NOT_FOUND)

    if request.method == 'GET':
        return Response(ScanRecordSerializer(record).data)
    if request.method == 'DELETE':
        record.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)

    serializer = ScanRecordSerializer(record, data=request.data, partial=True)
    serializer.is_valid(raise_exception=True)
    data = dict(serializer.validated_data)
    if 'filled_image' in data:
        data['filled_at'] = timezone.now()
    for field, value in data.items():
        setattr(record, field, value)
    record.save()
    return Response(ScanRecordSerializer(record).data)
